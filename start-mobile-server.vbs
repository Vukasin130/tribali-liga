Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\Vukasin\Documents\Codex\2026-07-14\ja\fantasy-app\apps\admin"
shell.Run """C:\Program Files\nodejs\node.exe"" ""serve-dist.mjs""", 0, False
