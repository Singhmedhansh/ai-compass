"""
Run consistency checks on pricing fields in tools.json.
Checks:
- pricing_tier is one of ['free', 'freemium', 'paid']
- pricing_tier corresponds to description/price values
- pricing_tiers structure is correct if present
"""
import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS_JSON_PATH = os.path.join(PROJECT_ROOT, "data", "tools.json")

def main():
    if not os.path.exists(TOOLS_JSON_PATH):
        print(f"ERROR: tools.json not found at {TOOLS_JSON_PATH}")
        sys.exit(1)
        
    with open(TOOLS_JSON_PATH, "r", encoding="utf-8") as f:
        tools = json.load(f)
        
    print(f"Loaded {len(tools)} tools from tools.json. Scanning for pricing anomalies...")
    
    anomalies = 0
    fixed_count = 0
    
    for i, t in enumerate(tools):
        name = t.get("name", "Unknown")
        slug = t.get("slug", "unknown")
        
        # 1. Check pricing_tier
        tier = t.get("pricing_tier")
        if not tier:
            print(f"[ANOMALY] {name} ({slug}): missing pricing_tier")
            # Auto-infer it
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from enrich_tools import infer_pricing_tier
            t["pricing_tier"] = infer_pricing_tier(t)
            print(f"  -> Auto-set pricing_tier to: {t['pricing_tier']}")
            anomalies += 1
            fixed_count += 1
            tier = t["pricing_tier"]
            
        if tier not in ("free", "freemium", "paid"):
            print(f"[ANOMALY] {name} ({slug}): pricing_tier is '{tier}' (must be free, freemium, or paid)")
            t["pricing_tier"] = str(tier).lower().strip()
            if t["pricing_tier"] not in ("free", "freemium", "paid"):
                t["pricing_tier"] = "freemium"  # fallback
            print(f"  -> Normalized pricing_tier to: {t['pricing_tier']}")
            anomalies += 1
            fixed_count += 1
            tier = t["pricing_tier"]
            
        # 2. Check pricing field consistency
        pricing = str(t.get("pricing") or "").lower().strip()
        price = str(t.get("price") or "").lower().strip()
        
        if tier == "free":
            # If tier is free, pricing shouldn't say paid
            if "paid" in pricing or "paid" in price:
                print(f"[ANOMALY] {name} ({slug}): pricing_tier is 'free' but pricing/price mentions 'paid'")
                anomalies += 1
        elif tier == "paid":
            # If tier is paid, pricing shouldn't be only "free"
            if pricing == "free" or price == "free":
                print(f"[ANOMALY] {name} ({slug}): pricing_tier is 'paid' but pricing/price is 'free'")
                anomalies += 1
                
        # 3. Check pricing_tiers structure
        tiers_obj = t.get("pricing_tiers")
        if tiers_obj:
            if not isinstance(tiers_obj, dict):
                print(f"[ANOMALY] {name} ({slug}): pricing_tiers is not a JSON object/dict")
                anomalies += 1
            else:
                tiers_list = tiers_obj.get("tiers")
                if not isinstance(tiers_list, list):
                    print(f"[ANOMALY] {name} ({slug}): pricing_tiers.tiers is not a list")
                    anomalies += 1
                else:
                    for idx, tier_item in enumerate(tiers_list):
                        tier_name = tier_item.get("name")
                        price_disp = tier_item.get("price_display")
                        cta_url = tier_item.get("cta_url")
                        cta_lbl = tier_item.get("cta_label")
                        features = tier_item.get("features")
                        
                        if not tier_name:
                            print(f"[ANOMALY] {name} ({slug}): tier #{idx} in pricing_tiers is missing name")
                            anomalies += 1
                        if price_disp is None:
                            print(f"[ANOMALY] {name} ({slug}): tier '{tier_name}' is missing price_display")
                            anomalies += 1
                        if not cta_url:
                            print(f"[ANOMALY] {name} ({slug}): tier '{tier_name}' is missing cta_url")
                            anomalies += 1
                        if not cta_lbl:
                            tier_item["cta_label"] = "Visit Website"
                            print(f"  -> Fixed: set cta_label for tier '{tier_name}' to 'Visit Website'")
                            fixed_count += 1
                        if not isinstance(features, list):
                            tier_item["features"] = []
                            print(f"  -> Fixed: set features for tier '{tier_name}' to list")
                            fixed_count += 1
                            
    print(f"\nAudit complete. Found {anomalies} anomalies. Fixed {fixed_count} schema/field anomalies in memory.")
    
    if fixed_count > 0:
        with open(TOOLS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(tools, f, indent=2, ensure_ascii=False)
        print("Saved updated tools.json with fixed fields.")
        
if __name__ == "__main__":
    main()
