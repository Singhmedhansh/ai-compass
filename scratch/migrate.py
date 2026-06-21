import sys
import os
import time
import psycopg2
from psycopg2.extras import DictCursor

TABLE_INSERT_ORDER = [
    "users",
    "categories",
    "tags",
    "tools",
    "tool_tags",
    "favorites",
    "tool_view_events",
    "tool_ratings",
    "ratings",
    "reviews",
    "review_votes",
    "saved_stacks",
    "linked_accounts",
    "user_sessions",
    "feedback",
    "app_settings",
    "feature_flags",
    "outbound_clicks",
    "digest_state",
    "submissions",
    "newsletter_subscribers",
    "bug_reports",
    "syllabus_stacks",
    "alembic_version",
    # Put catalog_tools at the absolute end since it is large and prone to timeouts
    "catalog_tools"
]

def bootstrap_target_schema(target_url):
    print("Bootstrapping target database schema using Flask app context...")
    sys.path.insert(0, os.getcwd())
    try:
        from app import create_app, db
        app = create_app({
            "SQLALCHEMY_DATABASE_URI": target_url,
            "TESTING": True
        })
        with app.app_context():
            db.create_all()
        print("Schema bootstrapped successfully.")
    except Exception as e:
        print(f"Warning: Failed to bootstrap schema via Flask app: {e}")

def get_connections(source_url, target_url):
    # Set connect_timeout to allow Neon to wake up if it's sleeping
    source_conn = psycopg2.connect(source_url, connect_timeout=15)
    target_conn = psycopg2.connect(target_url, connect_timeout=15)
    return source_conn, target_conn

def migrate(source_url, target_url):
    bootstrap_target_schema(target_url)

    print("Connecting to databases...")
    try:
        source_conn, target_conn = get_connections(source_url, target_url)
        source_cur = source_conn.cursor(cursor_factory=DictCursor)
        target_cur = target_conn.cursor()
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    try:
        # Get source tables
        source_cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name NOT IN ('spatial_ref_sys');
        """)
        source_tables = {r[0] for r in source_cur.fetchall()}
        
        ordered_tables = [t for t in TABLE_INSERT_ORDER if t in source_tables]
        unordered_tables = [t for t in source_tables if t not in ordered_tables]
        tables_to_migrate = ordered_tables + unordered_tables
        
        print(f"Found {len(tables_to_migrate)} tables to migrate.")

        # Truncate tables on target
        print("Truncating target tables...")
        for table in reversed(tables_to_migrate):
            try:
                target_cur.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
            except Exception as e:
                print(f"  -> Warning truncating {table}: {e}")
                target_conn.rollback()
        target_conn.commit()

        # Migrate data table by table
        for table in tables_to_migrate:
            print(f"Migrating table: {table}...")
            
            # Fetch all rows from source
            source_cur.execute(f'SELECT * FROM "{table}";')
            rows = source_cur.fetchall()
            if not rows:
                print(f"  -> Table {table} is empty. Skipping.")
                continue

            columns = [desc[0] for desc in source_cur.description]
            col_names = ", ".join(f'"{c}"' for c in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_query = f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders});'

            success_count = 0
            for i, row in enumerate(rows):
                retries = 3
                while retries > 0:
                    try:
                        target_cur.execute(insert_query, list(row))
                        success_count += 1
                        # Commit every 50 rows to keep transactions short
                        if success_count % 50 == 0:
                            target_conn.commit()
                        break
                    except (psycopg2.OperationalError, psycopg2.InterfaceError) as conn_err:
                        retries -= 1
                        print(f"Connection lost during migration of {table} at row {i} (Retries left: {retries}). Reconnecting in 5s...")
                        time.sleep(5)
                        try:
                            source_conn, target_conn = get_connections(source_url, target_url)
                            source_cur = source_conn.cursor(cursor_factory=DictCursor)
                            target_cur = target_conn.cursor()
                        except Exception as reconnect_err:
                            print(f"Reconnection attempt failed: {reconnect_err}")
                        if retries == 0:
                            raise conn_err
                    except Exception as e:
                        print(f"Error inserting row into {table} (Row data: {list(row)[:2]}...): {e}")
                        target_conn.rollback()
                        raise

            target_conn.commit()
            print(f"  -> Successfully migrated {success_count}/{len(rows)} rows.")

            # Reset sequence for this table immediately after migration
            target_cur.execute(f"""
                SELECT column_name, column_default 
                FROM information_schema.columns 
                WHERE table_name = %s AND column_default LIKE 'nextval%%';
            """, (table,))
            seq_cols = target_cur.fetchall()
            for col, default_val in seq_cols:
                try:
                    seq_name = default_val.split("'")[1]
                    target_cur.execute(f'SELECT MAX("{col}") FROM "{table}";')
                    max_id = target_cur.fetchone()[0]
                    if max_id is not None:
                        target_cur.execute(f"SELECT setval(%s, %s);", (seq_name, max_id))
                        print(f"  -> Sequence {seq_name} reset to {max_id}.")
                except Exception as seq_err:
                    print(f"  -> Warning resetting sequence for {table}.{col}: {seq_err}")
            target_conn.commit()

        print("Data migration completed successfully!")

    except Exception as e:
        print(f"An error occurred: {e}")
        try:
            target_conn.rollback()
        except:
            pass
    finally:
        try:
            source_conn.close()
            target_conn.close()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python migrate.py <source_url> <target_url>")
        sys.exit(1)
    migrate(sys.argv[1], sys.argv[2])
