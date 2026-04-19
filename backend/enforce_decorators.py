import os
import re

routes_dir = r"C:\Users\admin\Documents\GitHub\Product_Sales_Mangment\backend\routes"

def process_file(filepath):
    filename = os.path.basename(filepath)
    if filename == 'auth.py' or not filename.endswith('.py'):
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Start fresh: Filter out any existing require_auth and safe_route decorators
    # We will also remove the imports to re-add them consistently
    lines = content.split('\n')
    new_lines = []
    
    # Remove existing imports
    for line in lines:
        if "from auth import require_auth" in line: continue
        if "from error_handler import" in line and "safe_route" in line:
            # Handle mixed imports like: from error_handler import safe_route, ValidationError
            line = line.replace("safe_route, ", "").replace(", safe_route", "").replace("safe_route", "")
            if "import  " in line or line.strip().endswith("import"): continue
        
        # Remove the decorators themselves if they exist (to be re-added in correct order)
        if line.strip() == "@require_auth" or line.strip() == "@safe_route":
            continue
            
        new_lines.append(line)
        
    content = "\n".join(new_lines)

    # 2. Add imports at the top
    # Re-inject safe_route and require_auth
    if "from auth import require_auth" not in content:
        content = re.sub(r"(from flask import .*?)\n", r"\1\nfrom auth import require_auth\n", content, count=1)
    
    if "from error_handler import" in content:
         content = re.sub(r"(from error_handler import )", r"\1safe_route, ", content, count=1)
    else:
         content = re.sub(r"(from auth import require_auth\n)", r"\1from error_handler import safe_route\n", content, count=1)

    # 3. Enforce decorator stacks
    lines = content.split('\n')
    final_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        if line.strip().startswith('@') and '.route(' in line:
            # Found a route. Collect all decorators before the 'def'
            route_line = line
            decorators = []
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith('@'):
                decorators.append(lines[j])
                j += 1
            
            # Identify if it's a mutation
            is_mutation = any(m in route_line for m in ["'POST'", "'PUT'", "'DELETE'", '"POST"', '"PUT"', '"DELETE"'])
            
            # Reconstruct decorators
            # Order: 1. Route, 2. Limiter (if any), 3. Auth (if mutation), 4. Safe Route
            indent = line[:line.find('@')]
            
            new_decorators = [route_line]
            
            # Keep limiter or other custom decorators
            for d in decorators:
                if "@limiter" in d:
                    new_decorators.append(d)
                # potentially keep others if they aren't auth/safe_route
            
            if is_mutation:
                new_decorators.append(indent + "@require_auth")
            
            new_decorators.append(indent + "@safe_route")
            
            final_lines.extend(new_decorators)
            i = j - 1
        else:
            final_lines.append(line)
        i += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(final_lines))

for filename in os.listdir(routes_dir):
    process_file(os.path.join(routes_dir, filename))

print("Final Decorator Enforcer completed.")
