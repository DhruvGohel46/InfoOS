import os
import re

routes_dir = r"C:\Users\admin\Documents\GitHub\Product_Sales_Mangment\backend\routes"


def process_file(filepath):
    filename = os.path.basename(filepath)
    if filename == "auth.py" or not filename.endswith(".py"):
        return

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 1. Start fresh: Filter out any existing require_auth imports and decorators
    new_lines = []
    for line in lines:
        if "from auth import require_auth" in line:
            continue
        if "@require_auth" in line:
            continue
        new_lines.append(line)

    content = "".join(new_lines)

    # 2. Add import
    if "from auth import require_auth" not in content:
        content = re.sub(
            r"(from flask import .*?)\n", r"\1\nfrom auth import require_auth\n", content, count=1
        )

    # 3. Inject @require_auth above @safe_route for mutation routes
    lines = content.split("\n")
    final_lines = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # If this is a route with mutation methods
        if line.strip().startswith("@") and ".route(" in line:
            if any(
                m in line for m in ["'POST'", "'PUT'", "'DELETE'", '"POST"', '"PUT"', '"DELETE"']
            ):
                # Find all decorators belonging to this route before the 'def'
                decorators = [line]
                j = i + 1
                while j < len(lines) and lines[j].strip().startswith("@"):
                    decorators.append(lines[j])
                    j += 1

                # Check if @safe_route is in decorators
                safe_route_idx = -1
                for idx, d in enumerate(decorators):
                    if d.strip() == "@safe_route":
                        safe_route_idx = idx
                        break

                if safe_route_idx != -1:
                    # Inject @require_auth right above @safe_route
                    indent = decorators[safe_route_idx][: decorators[safe_route_idx].find("@")]
                    decorators.insert(safe_route_idx, indent + "@require_auth")
                else:
                    # No @safe_route? Just append at the end of decorators
                    indent = decorators[0][: decorators[0].find("@")]
                    decorators.append(indent + "@require_auth")

                final_lines.extend(decorators)
                i = j - 1  # Skip the decorators we processed
            else:
                final_lines.append(line)
        else:
            final_lines.append(line)
        i += 1

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(final_lines))


for filename in os.listdir(routes_dir):
    process_file(os.path.join(routes_dir, filename))

print("Fixed Auth injection completed.")
