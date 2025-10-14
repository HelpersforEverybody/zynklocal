# auto-commit.ps1
Write-Host "Starting auto Git commit & push watcher..."

function Get-CurrentBranch {
    $b = git rev-parse --abbrev-ref HEAD 2>$null
    if ($b) {
        return $b.Trim()
    }
    return ""
}

while ($true) {
    $porcelain = git status --porcelain 2>$null

    if ($porcelain) {
        $branch = Get-CurrentBranch
        if (-not $branch) {
            Write-Warning "Could not detect current branch"
            break
        }

        Write-Host ""
        Write-Host "[$branch] Changes detected... committing and pushing..."

        # show changed files for visibility
        Write-Host "Changed files:"
        $porcelain -split "`n" | ForEach-Object {
            if ($_.Trim()) { Write-Host "  $_" }
        }

        git add -A

        $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $msg

        # Detect upstream for current branch by asking git for its upstream branch name
        $hasUpstream = $false
        $up = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
        if ($up -and $up.Trim()) {
            $hasUpstream = $true
        }

        if (-not $hasUpstream) {
            Write-Host "No upstream set for branch '$branch' — pushing and setting upstream..."
            git push -u origin $branch
        }
        else {
            git push origin $branch
        }

        Write-Host "Committed and pushed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    Start-Sleep -Seconds 20
}
