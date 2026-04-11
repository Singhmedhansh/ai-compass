import json

tools = json.load(open('data/tools.json', encoding="utf-8"))
categories = set(t.get('category','MISSING') for t in tools)
pricings = set(t.get('pricing','MISSING') for t in tools)

with open('data_dump.txt', 'w', encoding='utf-8') as f:
    f.write('Total tools: ' + str(len(tools)) + '\n')
    f.write('Categories: ' + str(categories) + '\n')
    f.write('Pricings: ' + str(pricings) + '\n')
    f.write('Missing use_cases: ' + str(sum(1 for t in tools if not t.get('use_cases'))) + '\n')
    f.write('Missing tags: ' + str(sum(1 for t in tools if not t.get('tags'))) + '\n')
    f.write('Missing student_perk: ' + str(sum(1 for t in tools if 'student_perk' not in t)) + '\n')
    
    fields_to_check = ['tags', 'use_cases', 'strengths', 'pricing', 'student_perk', 'trending', 'featured', 'platforms', 'category', 'rating', 'review_count', 'company', 'logo_emoji']
    for k in fields_to_check:
        count = sum(1 for t in tools if k not in t)
        f.write(f"Missing {k}: {count}\n")
    
    f.write("--- FIRST TOOL ---\n")
    f.write(json.dumps(tools[0], indent=2))
    f.write("\n--- RANDOM TOOL ---\n")
    f.write(json.dumps(tools[20], indent=2))
