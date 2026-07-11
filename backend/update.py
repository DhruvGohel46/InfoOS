import os
import sys
import subprocess


def log(msg):
    print(f"[UpdateScript]: {msg}")
    sys.stdout.flush()


def main():
    log("Starting post-install updater script...")

    # Run library dependency checks/upgrades
    try:
        log("Checking python library dependencies...")
        try:
            import openpyxl

            log(f"Current openpyxl version installed: {openpyxl.__version__}")
            # If version is older than 3.1.5, upgrade it programmatically
            ver_parts = [int(x) for x in openpyxl.__version__.split(".") if x.isdigit()]
            if len(ver_parts) >= 3 and (
                ver_parts[0] < 3
                or (ver_parts[0] == 3 and ver_parts[1] < 1)
                or (ver_parts[0] == 3 and ver_parts[1] == 1 and ver_parts[2] < 5)
            ):
                log("Upgrading openpyxl library dynamically...")
                subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl>=3.1.5"])
                log("openpyxl upgraded successfully.")
        except Exception as py_err:
            log(f"Dependency upgrade warning: {py_err}. Attempting pip install openpyxl...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl>=3.1.5"])
            except Exception as pip_err:
                log(f"Failed to auto-upgrade openpyxl: {pip_err}")
    except Exception as e:
        log(f"Error checking dependencies: {e}")

    log("Updater script completed successfully.")


if __name__ == "__main__":
    main()
