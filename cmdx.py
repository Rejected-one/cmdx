from flask import Flask, render_template, request, session, jsonify, Response
import subprocess, os
from datetime import datetime
import json
from openai import OpenAI


app = Flask(__name__)


user_sessions = {}

def Access():
    adc = False
    if not os.path.exists("access.txt"):
        with open("access.txt", "w") as f:
            f.write("AccessesDangerousCommand:False")
    else:
        with open("access.txt", "r+") as f:
            adc = f.read().split(":")[1]
    return adc
Access()

@app.route("/", methods=["GET", "POST"])
def cmdx():
    if "command_history" not in user_sessions:
        user_sessions["command_history"] = []

    # File Explorer logic
    path = None
    path_forward = None
    try:
        result = subprocess.run(
            ["fsutil", "fsinfo", "drives"], capture_output=True, text=True, check=True
        )
        drives = result.stdout
    except subprocess.CalledProcessError as e:
        drives = f"Error executing driverquery: {e}"

    if request.method == "POST":

        drive = request.form.get("drive")
        folder_name = request.form.get("folder_name")
        Back = request.form.get("Back") == "Back"
        forward = request.form.get("forward") == "forward"

        if drive:
            user_sessions["drive"] = drive
            user_sessions["folder_name"] = drive
        else:
            drive = user_sessions.get("drive")

        if folder_name:
            user_sessions["folder_name"] = folder_name
        else:
            folder_name = user_sessions.get("folder_name")

        path = folder_name
        if not path:
            path = drive

        path_finall = path
        if path:
            if Back:
                parts = path.split("\\")
                path_Back = [p + "\\" for p in parts[:-1]] + [parts[-1]]
                path_Back = ("".join(path_Back[:-1]))[:-1]
                path_finall = path_Back
                user_sessions["folder_name"] = path_finall
                user_sessions["path_forward"] = path

            if forward:
                path_forward = user_sessions.get("path_forward")
                path_finall = path_forward
                user_sessions["folder_name"] = path_finall

            if drive and path and drive.split("\\")[0] != path.split("\\")[0]:
                user_sessions.pop("folder_name", None)

            folders = folder_tree(os.path.join(drive or "", path_finall or ""))

            return render_template(
                "index.html",
                drives=drives.replace("Drives: ", "").replace("\n", "").split(" ")[:-1],
                folders=folders,
                current_dir=(
                    (user_sessions.get("folder_name", "") + ">")
                    if user_sessions.get("folder_name")
                    else ""
                ),
                command_history=user_sessions["command_history"],
                current_time=datetime.now().strftime("%H:%M:%S"),
            )

    return render_template(
        "index.html",
        drives=drives.replace("Drives: ", "").replace("\n", "").split(" ")[:-1],
        folders=None,
        current_dir="",
        command_history=user_sessions["command_history"],
        current_time=datetime.now().strftime("%H:%M:%S"),
    )


@app.route("/suggest")
def suggest():
    try:
        partial = request.args.get("command", "").strip().lower()
        suggestions = []

        for cmd in CMD_DATABASE:
            if cmd["command"].startswith(partial) or partial in cmd["command"]:
                suggestion = {
                    "command": cmd["command"],
                    "description": cmd.get("description", ""),
                    "parameters": cmd.get("parameters", []),
                    "examples": cmd.get("examples", []),
                }
                suggestions.append(suggestion)

        suggestions.sort(key=lambda x: (len(x["command"]), x["command"]))
        return jsonify(
            {
                "status": "success",
                "suggestions": suggestions,
                "count": len(suggestions),
            }
        )

    except Exception as e:
        return jsonify({"status": "error", "message": str(e), "suggestions": []}), 500


def folder_tree(drive):
    list_folders = []
    try:
        for item in os.listdir(drive):
            item_path = os.path.join(drive, item)
            if item != "$RECYCLE.BIN" and os.path.isdir(item_path):
                list_folders.append(os.path.join(drive, item))
    except Exception:
        pass
    return list_folders


def run_commands(target, command: str):
    print(target, command)
    local = os.getcwd()
    if target:
        os.chdir(target)

    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=False, check=False
        )

        output = (
            result.stdout.decode("cp1256", errors="replace") if result.stdout else ""
        )
        if result.stderr:
            output += "\n" + result.stderr.decode("cp1256", errors="replace")

        return output
    except Exception as e:
        return f"Error: {str(e)}"
    finally:
        os.chdir(local)


@app.route("/live", methods=["POST"])
def live_command():
    command = request.form.get("command", "")
    print("Live command:", command)

    def generate(target):
        local = os.getcwd()
        if target:
            try:
                os.chdir(target)
            except Exception as e:
                yield f"<div>Error changing directory: {str(e)}</div>\n"
                return

        try:
            process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )

            while True:
                output = process.stdout.readline()
                if output == "" and process.poll() is not None:
                    break
                if output:
                    # escape کردن کاراکترهای HTML برای امنیت
                    escaped_output = (
                        output.replace("&", "&amp")
                        .replace("<", "&lt")
                        .replace(">", "&gt")
                    )
                    yield f"<div>{escaped_output}</div>\n"

            stderr_output = process.stderr.read()
            if stderr_output:
                escaped_error = (
                    stderr_output.replace("&", "&amp")
                    .replace("<", "&lt")
                    .replace(">", "&gt")
                )
                yield f"<div style='color:red'>{escaped_error}</div>\n"

        except Exception as e:
            yield f"<div style='color:red'>Error: {str(e)}</div>\n"
        finally:
            try:
                os.chdir(local)
            except:
                pass

    return Response(
        generate(user_sessions.get("folder_name", "")), mimetype="text/html"
    )


@app.route("/learn", methods=["POST"])
def learn():
    command = request.form.get("command", "")
    print("[[[]]]", command.replace("Learn\\", ""))
    client = OpenAI(
        base_url="https://api.gapgpt.app/v1",
        api_key="sk-NGd9H2XzGXR1dyP7yqjr7j9Jd2c4KmgwCCopeTWwenRXhGWK",
    )

    try:
        response = client.chat.completions.create(
            model="gemma-3-27b-it",
            messages=[
                {
                    "role": "user",
                    "content": (
                        "من یک دستور CMD ویندوز را به تو می‌دهم. لطفاً دقیقاً توضیح بده که این دستور چه کاری انجام می‌دهد، "
                        "چه خروجی‌ای دارد، آیا نیاز به دسترسی ادمین دارد، و آیا خطری دارد یا خیر. "
                        "همچنین در صورت لزوم، مثال‌های مشابه یا دستورات جایگزین هم ارائه بده.\n\n"
                        f"دستور: `{command.replace("Learn\\","")}`"
                    ),
                }
            ],
        )
        output = response.choices[0].message.content
        user_sessions["command_history"].append(
            {
                "command": command,
                "output": output,
                "dir": user_sessions.get("folder_name", ""),
                "time": datetime.now().strftime("%H:%M:%S"),
            }
        )

        return jsonify({"status": "ok", "output": output})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/run", methods=["POST"])
def run_command_normal():
    command = request.form.get("command", "")
    if "command_history" not in user_sessions:
        user_sessions["command_history"] = []

    current_dir = user_sessions.get("folder_name", "")
    output = run_commands(current_dir, command)

    user_sessions["command_history"].append(
        {
            "command": command,
            "output": output,
            "dir": current_dir,
            "time": datetime.now().strftime("%H:%M:%S"),
        }
    )

    return jsonify({"status": "ok", "output": output})


@app.route("/clear_history", methods=["POST"])
def clear_history():
    user_sessions["command_history"] = []

    return jsonify({"status": "ok"})


# accesses dangerous commands
@app.route("/adc", methods=["POST"])
def Adc():

    data = request.get_json()
    if not data:
        return jsonify({"error": "بدنهٔ درخواست خالی است"}), 400
    with open("access.txt", "w") as f:
        f.write("AccessesDangerousCommand:True")
    return jsonify({"status": Access(), "message": "وضعیت مجوز کاربر"}), 200


@app.route("/api/adc_status")
def get_adc_status():
    return jsonify({"status": Access(), "message": "وضعیت مجوز کاربر"})


@app.route("/learn_dangerous_commands.html", methods=["POST", "GET"])
def learn_dangerous_commands():
    return render_template("learn_dangerous_commands.html")


with open("data.json", encoding="utf-8") as f:
    CMD_DATABASE = json.load(f)["cmd_commands"]


if __name__ == "__main__":

    app.run()
