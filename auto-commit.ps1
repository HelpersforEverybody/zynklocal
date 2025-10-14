Write-Host "Starting auto Git commit & push watcher..."

# Which branch to push to
$branch = "main"

while ($true) {
    # Detect unstaged changes
    $status = git status --porcelain
    if ($status) {
        Write-Host ""
        Write-Host "🟡 Changes detected... committing and pushing..."
        git add -A
        $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $msg
        git push origin $branch
        Write-Host "✅ Committed and pushed at $(Get-Date)"
    }
    Start-Sleep -Seconds 20  # check every 20 seconds
}
