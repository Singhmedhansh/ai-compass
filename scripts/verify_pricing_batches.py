"""Interactive CLI tool to verify pricing of all catalog tools in batches of 20,
ordered by rating descending.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Setup paths
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app, db
from app.models import CatalogTool
from app.catalog_store import _is_placeholder, upsert_tool

TOOLS_JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "tools.json",
)


def load_all_tools() -> list[dict]:
    """Load all tools from CatalogTool DB, sorted by rating desc, review_count desc."""
    rows = CatalogTool.query.all()
    records = []
    for r in rows:
        if _is_placeholder(r.slug, r.name):
            continue
        try:
            rec = json.loads(r.data) if r.data else {}
        except (ValueError, TypeError):
            rec = {}
        
        # Ensure standard keys exist
        rec["slug"] = r.slug
        rec["name"] = r.name
        rec["rating"] = float(rec.get("rating", 0.0) or 0.0)
        rec["review_count"] = int(rec.get("review_count", 0) or 0)
        records.append(rec)
        
    # Sort by rating desc, review_count desc
    records.sort(key=lambda x: (x["rating"], x["review_count"]), reverse=True)
    return records


def save_tool_to_json_and_db(tool_rec: dict):
    """Save the updated tool record to CatalogTool DB and sync back to tools.json."""
    # 1. DB Save
    upsert_tool(tool_rec)
    
    # 2. JSON File Sync
    if os.path.exists(TOOLS_JSON_PATH):
        try:
            with open(TOOLS_JSON_PATH, "r", encoding="utf-8") as f:
                tools = json.load(f)
            
            # Find and replace in JSON list
            slug = tool_rec.get("slug")
            updated = False
            for idx, t in enumerate(tools):
                if t.get("slug") == slug:
                    # Update pricing keys
                    for k in ["pricing", "pricing_tier", "pricing_tiers", "last_verified_at"]:
                        if k in tool_rec:
                            t[k] = tool_rec[k]
                    updated = True
                    break
            
            if updated:
                with open(TOOLS_JSON_PATH, "w", encoding="utf-8") as f:
                    json.dump(tools, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error syncing to tools.json: {e}")


def display_batch_list(tools: list[dict], batch_size: int = 20):
    total = len(tools)
    batches_count = (total + batch_size - 1) // batch_size
    print("\n" + "=" * 60)
    print(f"AI Compass Pricing Verification batches ({total} tools total)")
    print("=" * 60)
    for i in range(batches_count):
        start_idx = i * batch_size
        end_idx = min(start_idx + batch_size, total)
        batch_tools = tools[start_idx:end_idx]
        max_rating = batch_tools[0]["rating"] if batch_tools else 0.0
        min_rating = batch_tools[-1]["rating"] if batch_tools else 0.0
        print(f"  [{i + 1}] Batch {i + 1}: Tools {start_idx + 1}-{end_idx} (Rating: {max_rating} - {min_rating})")
    print("  [E] Exit")


def display_batch_tools(batch_idx: int, tools: list[dict], batch_size: int = 20):
    start_idx = batch_idx * batch_size
    end_idx = min(start_idx + batch_size, len(tools))
    batch_tools = tools[start_idx:end_idx]
    
    print("\n" + "=" * 80)
    print(f"BATCH {batch_idx + 1} (Tools {start_idx + 1} to {end_idx})")
    print("=" * 80)
    print(f"{'#':<3} | {'Name':<20} | {'Slug':<20} | {'Rating':<6} | {'Tier':<8} | {'Details / Verified':<25}")
    print("-" * 80)
    
    for idx, t in enumerate(batch_tools):
        item_num = start_idx + idx + 1
        name = t.get("name", "Unknown")[:20]
        slug = t.get("slug", "unknown")[:20]
        rating = t.get("rating", 0.0)
        tier = t.get("pricing_tier", "unknown")
        
        pricing_details = t.get("pricing", "N/A")
        verified = t.get("last_verified_at", "Never")
        details_str = f"{pricing_details} ({verified})"[:25]
        
        print(f"{item_num:<3} | {name:<20} | {slug:<20} | {rating:<6} | {tier:<8} | {details_str:<25}")
    print("=" * 80)


def edit_tool_pricing(tool: dict):
    print(f"\n--- EDITING PRICING FOR: {tool.get('name')} ({tool.get('slug')}) ---")
    
    # 1. Edit pricing tier
    current_tier = tool.get("pricing_tier", "freemium")
    new_tier = input(f"Pricing Tier (free/freemium/paid) [current: {current_tier}]: ").strip().lower()
    if new_tier:
        if new_tier in ["free", "freemium", "paid"]:
            tool["pricing_tier"] = new_tier
        else:
            print("Invalid pricing tier. Keeping current value.")
            
    # 2. Edit pricing string
    current_pricing = tool.get("pricing", "")
    new_pricing = input(f"Pricing description (e.g. Free / $20/mo) [current: {current_pricing}]: ").strip()
    if new_pricing:
        tool["pricing"] = new_pricing
        
    # 3. Edit source url
    pricing_tiers = tool.setdefault("pricing_tiers", {})
    if not isinstance(pricing_tiers, dict):
        pricing_tiers = {}
        tool["pricing_tiers"] = pricing_tiers
        
    current_url = pricing_tiers.get("source_url", "")
    new_url = input(f"Pricing source URL [current: {current_url}]: ").strip()
    if new_url:
        pricing_tiers["source_url"] = new_url

    # 4. Prompt to edit specific price tiers
    edit_tiers = input("Would you like to edit detailed pricing tiers? (y/n) [n]: ").strip().lower() == "y"
    if edit_tiers:
        tiers_list = pricing_tiers.setdefault("tiers", [])
        if not isinstance(tiers_list, list):
            tiers_list = []
            pricing_tiers["tiers"] = tiers_list
            
        print("\nCurrent detailed tiers:")
        for i, tr in enumerate(tiers_list):
            print(f"  [{i}] {tr.get('name')}: {tr.get('price_display')} (Popular: {tr.get('is_popular', False)})")
            
        add_edit = input("Type 'add' to append a tier, or the index number to edit/delete: ").strip().lower()
        if add_edit == "add":
            name = input("Tier name (e.g. Pro, Free): ").strip()
            price_disp = input("Price display (e.g. $10/mo, Free): ").strip()
            price_amt = input("Price amount as number (e.g. 10.0, 0.0): ").strip()
            cta_url = input("CTA URL (optional): ").strip()
            cta_lbl = input("CTA Label (optional, default: Choose Plan): ").strip()
            features_raw = input("Features (comma-separated list): ").strip()
            features = [f.strip() for f in features_raw.split(",") if f.strip()] if features_raw else []
            is_popular = input("Mark as popular? (y/n) [n]: ").strip().lower() == "y"
            
            try:
                price_amt = float(price_amt) if price_amt else 0.0
            except ValueError:
                price_amt = 0.0
                
            tiers_list.append({
                "name": name,
                "price_display": price_disp,
                "price_amount": price_amt,
                "cta_url": cta_url,
                "cta_label": cta_lbl or "Choose Plan",
                "features": features,
                "is_popular": is_popular
            })
            print("Tier added!")
        elif add_edit.isdigit():
            idx = int(add_edit)
            if 0 <= idx < len(tiers_list):
                action = input("Type 'edit' to update or 'del' to delete: ").strip().lower()
                if action == "del":
                    tiers_list.pop(idx)
                    print("Tier deleted.")
                elif action == "edit":
                    tr = tiers_list[idx]
                    name = input(f"Tier name [current: {tr.get('name')}]: ").strip()
                    price_disp = input(f"Price display [current: {tr.get('price_display')}]: ").strip()
                    price_amt = input(f"Price amount [current: {tr.get('price_amount')}]: ").strip()
                    features_raw = input(f"Features (comma-separated) [current: {','.join(tr.get('features', []))}]: ").strip()
                    is_popular_str = input(f"Mark as popular? (y/n) [current: {tr.get('is_popular')}]: ").strip().lower()
                    
                    if name: tr["name"] = name
                    if price_disp: tr["price_display"] = price_disp
                    if price_amt:
                        try:
                            tr["price_amount"] = float(price_amt)
                        except ValueError:
                            pass
                    if features_raw:
                        tr["features"] = [f.strip() for f in features_raw.split(",") if f.strip()]
                    if is_popular_str:
                        tr["is_popular"] = is_popular_str == "y"
                    print("Tier updated!")

    # Set last verified
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tool["last_verified_at"] = today
    pricing_tiers["last_verified_at"] = today
    
    # Save changes
    save_tool_to_json_and_db(tool)
    print("Changes saved successfully to DB and tools.json!")


def main():
    app = create_app()
    with app.app_context():
        tools = load_all_tools()
        batch_size = 20
        total = len(tools)
        
        while True:
            display_batch_list(tools, batch_size)
            choice = input("\nSelect a batch number to verify, or [E] to exit: ").strip().lower()
            if choice == "e":
                break
                
            if not choice.isdigit():
                print("Invalid input. Please enter a number.")
                continue
                
            batch_num = int(choice)
            batches_count = (total + batch_size - 1) // batch_size
            if not (1 <= batch_num <= batches_count):
                print(f"Invalid batch number. Must be between 1 and {batches_count}.")
                continue
                
            batch_idx = batch_num - 1
            
            while True:
                display_batch_tools(batch_idx, tools, batch_size)
                print("Actions:")
                print("  [Enter] Mark all tools in this batch as verified (updates last_verified_at to today)")
                print("  [edit <slug>] Edit a specific tool's pricing details")
                print("  [b] Go back to batch list")
                print("  [e] Exit program")
                
                action = input("\nEnter choice: ").strip()
                if not action:
                    # Mark all as verified
                    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                    start_idx = batch_idx * batch_size
                    end_idx = min(start_idx + batch_size, total)
                    
                    print(f"\nVerifying tools {start_idx + 1} to {end_idx}...")
                    for idx in range(start_idx, end_idx):
                        t = tools[idx]
                        t["last_verified_at"] = today
                        pricing_tiers = t.setdefault("pricing_tiers", {})
                        if isinstance(pricing_tiers, dict):
                            pricing_tiers["last_verified_at"] = today
                        save_tool_to_json_and_db(t)
                        
                    print(f"Successfully marked all {end_idx - start_idx} tools in Batch {batch_num} as verified!")
                    break
                elif action.lower() == "b":
                    break
                elif action.lower() == "e":
                    return
                elif action.lower().startswith("edit "):
                    target_slug = action[5:].strip().lower()
                    # Find tool in batch
                    start_idx = batch_idx * batch_size
                    end_idx = min(start_idx + batch_size, total)
                    target_tool = None
                    for idx in range(start_idx, end_idx):
                        if tools[idx].get("slug") == target_slug:
                            target_tool = tools[idx]
                            break
                            
                    if target_tool:
                        edit_tool_pricing(target_tool)
                        # Reload tools to reflect changes
                        tools = load_all_tools()
                    else:
                        print(f"Could not find tool with slug '{target_slug}' in this batch.")
                else:
                    print("Invalid option. Try again.")


if __name__ == "__main__":
    main()
