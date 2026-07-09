import subprocess
import sys
import os
import time

def main():
    root_dir = os.path.abspath(os.path.dirname(__file__))
    server_dir = os.path.join(root_dir, "server")
    app_py = os.path.join(server_dir, "app.py")
    
    print()
    print("==================================================")
    print("      DRIVESPHERE SYSTEM LAUNCHER")
    print("==================================================")
    print(f"[Launcher] Starting Flask Authentication Server...")
    print(f"[Launcher] Script path: {app_py}")
    print()
    
    try:
        # Launch Flask server using the current Python environment
        process = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=server_dir
        )
        
        # Give it a second to boot up
        time.sleep(1)
        
        print("==================================================")
        print("  System started! Go to: http://localhost:5000")
        print("  Press Ctrl+C in this terminal to stop the server.")
        print("==================================================")
        print()
        
        process.wait()
    except KeyboardInterrupt:
        print("\n[Launcher] Shutting down server...")
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        print("[Launcher] Server stopped safely.")
    except Exception as e:
        print(f"[Launcher] Error running server: {e}")

if __name__ == "__main__":
    main()
