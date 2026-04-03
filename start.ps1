# start.ps1 - Start zDashboard from anywhere
# Usage: .\start.ps1 (or powershell /path/to/zdashboard/start.ps1)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
node server.js
