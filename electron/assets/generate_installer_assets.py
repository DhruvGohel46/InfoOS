import os
import sys
from PIL import Image, ImageDraw, ImageFont

def generate_installer_assets():
    # Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir) # parent of electron
    logo_path = os.path.join(os.path.dirname(script_dir), 'Logo.png')
    if not os.path.exists(logo_path):
        logo_path = os.path.join(project_root, 'frontend', 'public', 'logo.png')
        
    print(f"Using logo from: {logo_path}")
    
    # Load brand logo
    logo = None
    if os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
        except Exception as e:
            print(f"Error loading logo: {e}")
            
    # Brand design tokens
    bg_dark = (15, 17, 21) # #0f1115
    primary_orange = (249, 115, 22) # #f97316
    primary_orange_glow = (249, 115, 22, 40)
    white = (250, 250, 250)
    text_muted = (163, 163, 163) # #a3a3a3
    
    # Fonts
    font_bold_path = "C:\\Windows\\Fonts\\segoeuib.ttf"
    font_reg_path = "C:\\Windows\\Fonts\\segoeui.ttf"
    
    # -------------------------------------------------------------
    # 1. Create installerHeader.bmp (150 x 57)
    # -------------------------------------------------------------
    header_w, header_h = 150, 57
    header = Image.new("RGB", (header_w, header_h), bg_dark)
    draw_h = ImageDraw.Draw(header)
    
    # Subtle gradient/glow on the right
    for r in range(40, 0, -1):
        color = (
            bg_dark[0] + int((primary_orange[0] - bg_dark[0]) * (r / 90.0)),
            bg_dark[1] + int((primary_orange[1] - bg_dark[1]) * (r / 90.0)),
            bg_dark[2] + int((primary_orange[2] - bg_dark[2]) * (r / 90.0))
        )
        draw_h.ellipse([header_w - r*2, header_h // 2 - r, header_w, header_h // 2 + r], outline=color)
        
    # Place miniature logo on the right
    if logo:
        logo_size = 46
        logo_resized = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        logo_x = header_w - logo_size - 8
        logo_y = (header_h - logo_size) // 2
        # Blend RGBA with RGB background
        header.paste(logo_resized, (logo_x, logo_y), logo_resized)
        
    # Add title text
    try:
        font_h = ImageFont.truetype(font_bold_path, 13)
        draw_h.text((8, 14), "InfoOS Setup", font=font_h, fill=white)
        font_h_sub = ImageFont.truetype(font_reg_path, 9)
        draw_h.text((8, 31), "POS & Sales Management", font=font_h_sub, fill=text_muted)
    except Exception as e:
        print(f"Font loading failed for header: {e}")
        draw_h.text((8, 14), "InfoOS Setup", fill=white)
        draw_h.text((8, 31), "POS & Sales Management", fill=text_muted)
        
    header_out = os.path.join(script_dir, "installerHeader.bmp")
    header.save(header_out, "BMP")
    print(f"Saved: {header_out}")

    # -------------------------------------------------------------
    # 2. Create installerSidebar.bmp (164 x 314)
    # -------------------------------------------------------------
    sidebar_w, sidebar_h = 164, 314
    sidebar = Image.new("RGB", (sidebar_w, sidebar_h), bg_dark)
    draw_s = ImageDraw.Draw(sidebar)
    
    # Soft vertical gradient or background design
    for y in range(sidebar_h):
        # Blend from #161a22 (top) to #0f1115 (bottom)
        factor = y / sidebar_h
        r = int(22 * (1 - factor) + 15 * factor)
        g = int(26 * (1 - factor) + 17 * factor)
        b = int(34 * (1 - factor) + 21 * factor)
        draw_s.line([(0, y), (sidebar_w, y)], fill=(r, g, b))
        
    # Draw soft radial glow in the middle
    glow_center_x, glow_center_y = sidebar_w // 2, 110
    for r in range(60, 0, -2):
        factor = (60 - r) / 60.0
        color = (
            int(bg_dark[0] + (primary_orange[0] - bg_dark[0]) * factor * 0.25),
            int(bg_dark[1] + (primary_orange[1] - bg_dark[1]) * factor * 0.25),
            int(bg_dark[2] + (primary_orange[2] - bg_dark[2]) * factor * 0.25)
        )
        draw_s.ellipse([glow_center_x - r, glow_center_y - r, glow_center_x + r, glow_center_y + r], outline=color)

    # Place resized logo in the upper center
    if logo:
        logo_size = 78
        logo_resized = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        logo_x = (sidebar_w - logo_size) // 2
        logo_y = 60
        sidebar.paste(logo_resized, (logo_x, logo_y), logo_resized)
        
    # Draw branded text
    try:
        font_s_title = ImageFont.truetype(font_bold_path, 18)
        # Center title text "InfoOS"
        title_text = "InfoOS"
        title_w = draw_s.textlength(title_text, font=font_s_title)
        draw_s.text(((sidebar_w - title_w) // 2, 155), title_text, font=font_s_title, fill=primary_orange)
        
        font_s_sub = ImageFont.truetype(font_reg_path, 11)
        sub_text = "Standard POS Edition"
        sub_w = draw_s.textlength(sub_text, font=font_s_sub)
        draw_s.text(((sidebar_w - sub_w) // 2, 185), sub_text, font=font_s_sub, fill=white)
        
        font_s_footer = ImageFont.truetype(font_reg_path, 9)
        footer_text = "Premium Local System"
        footer_w = draw_s.textlength(footer_text, font=font_s_footer)
        draw_s.text(((sidebar_w - footer_w) // 2, 280), footer_text, font=font_s_footer, fill=text_muted)
    except Exception as e:
        print(f"Font loading failed for sidebar: {e}")
        draw_s.text((sidebar_w // 2 - 20, 155), "InfoOS", fill=primary_orange)
        draw_s.text((sidebar_w // 2 - 40, 185), "POS Edition", fill=white)
        
    sidebar_out = os.path.join(script_dir, "installerSidebar.bmp")
    sidebar.save(sidebar_out, "BMP")
    
    # Save the exact same image for uninstallerSidebar.bmp as required
    uninst_sidebar_out = os.path.join(script_dir, "uninstallerSidebar.bmp")
    sidebar.save(uninst_sidebar_out, "BMP")
    
    print(f"Saved: {sidebar_out}")
    print(f"Saved: {uninst_sidebar_out}")

if __name__ == "__main__":
    generate_installer_assets()
