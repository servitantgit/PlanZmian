# ================================================================
# PLAN ZMIAN - EXPORT PROJECT TO code.json
# ================================================================
# Version: 5.0 - Profile support (full/code/ui/docs)
#
# PURPOSE:
#   Package project as JSON for AI chat upload. Profiles let you
#   generate smaller files when you only need part of the project.
#
# USAGE:
#   .\tools\export-code.ps1              -> full (default, all files)
#   .\tools\export-code.ps1 full         -> same as default
#   .\tools\export-code.ps1 code         -> code only (js/html/json), no CSS/MD
#   .\tools\export-code.ps1 ui           -> js/html/css/json, no MD
#   .\tools\export-code.ps1 docs         -> MD + i18n + ps1 (no js/css)
#   .\tools\export-code.ps1 -h           -> show help
#   .\tools\export-code.ps1 --help       -> show help
#
# OUTPUT FILES:
#   full  -> code.json
#   code  -> code-code.json
#   ui    -> code-ui.json
#   docs  -> code-docs.json
#
# WORKFLOW:
#   1. Choose profile based on chat topic
#   2. Upload output JSON to AI chat
#   3. AI reads .files array + describes changes
#   4. Use Cline (VS Code) to apply
#   5. Verify with git diff, test in browser, commit
#
# WHY JSON:
#   application/json always passes chat upload filters.
#   .md/.txt with lots of code trigger "unsupported file" errors.
# ================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# --- ARGUMENT PARSING ---

$Profile = 'full'
if ($args.Count -gt 0) {
    $arg = $args[0].ToString().ToLower()
    if ($arg -eq '-h' -or $arg -eq '--help' -or $arg -eq '/?' -or $arg -eq 'help') {
        Write-Host ""
        Write-Host "PLAN ZMIAN - export-code.ps1" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "USAGE:" -ForegroundColor Yellow
        Write-Host "  .\tools\export-code.ps1 [profile]"
        Write-Host ""
        Write-Host "PROFILES:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  full  (default)  Everything -> code.json (~950 KB)" -ForegroundColor White
        Write-Host "                   Use when: first upload to a new chat"
        Write-Host ""
        Write-Host "  code             JS + HTML + JSON -> code-code.json (~600 KB)" -ForegroundColor White
        Write-Host "                   Use when: working on business logic / functions"
        Write-Host "                   Excludes: CSS, all MD"
        Write-Host ""
        Write-Host "  ui               JS + HTML + CSS + JSON -> code-ui.json (~700 KB)" -ForegroundColor White
        Write-Host "                   Use when: working on visual interface"
        Write-Host "                   Excludes: MD documentation"
        Write-Host ""
        Write-Host "  docs             MD + i18n + PS1 -> code-docs.json (~150 KB)" -ForegroundColor White
        Write-Host "                   Use when: updating docs / translations / workflow"
        Write-Host "                   Excludes: all JS (except i18n), CSS, HTML, sw.js"
        Write-Host ""
        Write-Host "EXAMPLES:" -ForegroundColor Yellow
        Write-Host "  .\tools\export-code.ps1"
        Write-Host "  .\tools\export-code.ps1 code"
        Write-Host "  .\tools\export-code.ps1 docs"
        Write-Host ""
        exit 0
    }
    if ($arg -eq 'full' -or $arg -eq 'code' -or $arg -eq 'ui' -or $arg -eq 'docs') {
        $Profile = $arg
    } else {
        Write-Host ""
        Write-Host "[ERROR] Unknown profile: '$arg'" -ForegroundColor Red
        Write-Host ""
        Write-Host "Available profiles: full, code, ui, docs" -ForegroundColor Yellow
        Write-Host "Run '.\tools\export-code.ps1 -h' for details" -ForegroundColor Gray
        Write-Host ""
        exit 1
    }
}

# --- CONFIGURATION ---

$OUTPUT_FILE = switch ($Profile) {
    'full' { 'code.json' }
    'code' { 'code-code.json' }
    'ui'   { 'code-ui.json' }
    'docs' { 'code-docs.json' }
}

$MAX_FILE_SIZE_KB = 500
$MAX_TOTAL_SIZE_KB = 2048

# Base include list — narrowed per profile below
$INCLUDE_EXTENSIONS_BY_PROFILE = @{
    'full' = @('.html', '.js', '.css', '.json', '.md', '.ps1', '.yml', '.yaml', '.txt')
    'code' = @('.html', '.js', '.json', '.txt')
    'ui'   = @('.html', '.js', '.css', '.json')
    'docs' = @('.md', '.json', '.ps1', '.yml', '.yaml')
}

$INCLUDE_EXTENSIONS = $INCLUDE_EXTENSIONS_BY_PROFILE[$Profile]

# For 'docs' profile: allow js/i18n/*.js as exception to "no js" rule
$DOCS_JS_ALLOWLIST = @(
    'js/i18n/pl.js',
    'js/i18n/en.js',
    'js/i18n/uk.js',
    'js/i18n/i18n.js'
)

$EXCLUDE_PATTERNS = @(
    '\.git',
    'node_modules',
    '\.venv',
    'venv',
    'screenshots',
    'icons',
    'tools',
    '\.vscode',
    '__pycache__',
    '\.pytest_cache'
)

$EXCLUDE_FILES = @(
    'code.md',
    'code.txt',
    'code.json',
    'code-code.json',
    'code-ui.json',
    'code-docs.json',
    'HANDOFF.md',
    'package-lock.json',
    'yarn.lock',
    '.env',
    '.DS_Store',
    'Thumbs.db'
)

$EXCLUDE_FILE_PATTERNS = @(
    'mockup-*.html',
    '*.min.js',
    '*.min.css',
    '*.backup',
    '*.log',
    '*.tmp'
)

# --- HELPER FUNCTIONS ---

function Get-LanguageHint {
    param([string]$Extension)
    switch ($Extension) {
        '.js'   { 'javascript' }
        '.html' { 'html' }
        '.css'  { 'css' }
        '.json' { 'json' }
        '.md'   { 'markdown' }
        '.ps1'  { 'powershell' }
        '.yml'  { 'yaml' }
        '.yaml' { 'yaml' }
        default { 'text' }
    }
}

function Should-ExcludeFile {
    param([string]$FilePath, [string]$FileName)
    foreach ($pattern in $EXCLUDE_PATTERNS) {
        if ($FilePath -match $pattern) { return $true }
    }
    if ($EXCLUDE_FILES -contains $FileName) { return $true }
    foreach ($pattern in $EXCLUDE_FILE_PATTERNS) {
        if ($FileName -like $pattern) { return $true }
    }
    return $false
}

# Docs profile: only allow js/i18n/*.js among all .js files, exclude everything else
function Should-IncludeInDocsProfile {
    param([string]$FilePath)
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    if ($ext -ne '.js') { return $true }  # non-js is fine per extension filter
    # For .js, only allow i18n files
    return ($DOCS_JS_ALLOWLIST -contains $FilePath)
}

function Get-GitInfo {
    $info = @{ Commit = "unknown"; Branch = "unknown"; Status = "unknown" }
    try {
        $commit = git rev-parse --short HEAD 2>$null
        if ($LASTEXITCODE -eq 0) { $info.Commit = $commit.Trim() }
    } catch {}
    try {
        $branch = git branch --show-current 2>$null
        if ($LASTEXITCODE -eq 0) { $info.Branch = $branch.Trim() }
    } catch {}
    try {
        $status = git status --porcelain 2>$null
        if ($LASTEXITCODE -eq 0) {
            if ([string]::IsNullOrWhiteSpace($status)) { $info.Status = "clean" }
            else {
                $modifiedCount = ($status -split "`n" | Where-Object { $_.Trim() }).Count
                $info.Status = "$modifiedCount uncommitted change(s)"
            }
        }
    } catch {}
    return $info
}

function Format-FileSize {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return "$Bytes B" }
    if ($Bytes -lt 1048576) { return "{0:N1} KB" -f ($Bytes / 1024) }
    return "{0:N2} MB" -f ($Bytes / 1048576)
}

function Get-ProjectTree {
    param([string]$RootPath, [int]$MaxDepth = 4)
    $script:tree = @()
    $script:tree += "PlanZmian/"

    function Add-TreeLevel {
        param([string]$Path, [string]$Prefix, [int]$CurrentDepth, [int]$MaxDepth)
        if ($CurrentDepth -ge $MaxDepth) { return }
        $items = Get-ChildItem -Path $Path -Force | Sort-Object { $_.PSIsContainer -eq $false }, Name
        $items = $items | Where-Object {
            $itemPath = $_.FullName.Replace('\', '/')
            -not (Should-ExcludeFile -FilePath $itemPath -FileName $_.Name)
        }
        $count = $items.Count
        for ($i = 0; $i -lt $count; $i++) {
            $item = $items[$i]
            $isLast = ($i -eq $count - 1)
            $marker = if ($isLast) { "\--- " } else { "+--- " }
            $extension = if ($item.PSIsContainer) { "/" } else { "" }
            $line = "$Prefix$marker$($item.Name)$extension"
            $script:tree += $line
            if ($item.PSIsContainer) {
                $newPrefix = if ($isLast) { "$Prefix     " } else { "$Prefix|    " }
                Add-TreeLevel -Path $item.FullName -Prefix $newPrefix -CurrentDepth ($CurrentDepth + 1) -MaxDepth $MaxDepth
            }
        }
    }

    Add-TreeLevel -Path $RootPath -Prefix "" -CurrentDepth 0 -MaxDepth $MaxDepth
    return ($script:tree -join "`n")
}

# --- MAIN EXECUTION ---

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " PLAN ZMIAN - Export ($Profile) -> $OUTPUT_FILE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "index.html")) {
    Write-Host "[ERROR] index.html not found. Run from project root!" -ForegroundColor Red
    exit 1
}

$projectRoot = Get-Location
Write-Host "[INFO] Project root: $projectRoot" -ForegroundColor Gray
Write-Host "[INFO] Profile: $Profile" -ForegroundColor Gray
Write-Host "[INFO] Extensions: $($INCLUDE_EXTENSIONS -join ', ')" -ForegroundColor Gray

$gitInfo = Get-GitInfo
Write-Host "[INFO] Git: $($gitInfo.Branch) | $($gitInfo.Commit) | $($gitInfo.Status)" -ForegroundColor Gray

Write-Host ""
Write-Host "[SCAN] Scanning project files..." -ForegroundColor Yellow

$allFiles = Get-ChildItem -Path $projectRoot -Recurse -File -Force | Where-Object {
    $ext = $_.Extension.ToLower()
    $INCLUDE_EXTENSIONS -contains $ext
}

$includedFiles = @()
$excludedCount = 0
$docsExcludedJs = 0

foreach ($file in $allFiles) {
    $relativePath = $file.FullName.Substring($projectRoot.Path.Length + 1).Replace('\', '/')
    if (Should-ExcludeFile -FilePath $relativePath -FileName $file.Name) {
        $excludedCount++
        continue
    }
    # Docs profile: exclude js/*.js except i18n
    if ($Profile -eq 'docs' -and -not (Should-IncludeInDocsProfile -FilePath $relativePath)) {
        $docsExcludedJs++
        continue
    }
    $includedFiles += $file
}

$includedFiles = $includedFiles | Sort-Object {
    $rel = $_.FullName.Substring($projectRoot.Path.Length + 1)
    $depth = ($rel -split '[\\/]').Count
    "{0:D3}_{1}" -f $depth, $rel
}

Write-Host "[SCAN] Found $($allFiles.Count) files, included $($includedFiles.Count), excluded $excludedCount" -ForegroundColor Gray
if ($Profile -eq 'docs' -and $docsExcludedJs -gt 0) {
    Write-Host "[SCAN] Docs profile: also excluded $docsExcludedJs js/*.js files (kept i18n only)" -ForegroundColor Gray
}

$totalSize = ($includedFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "[SIZE] Total content: $(Format-FileSize $totalSize)" -ForegroundColor Gray

Write-Host ""
Write-Host "[TREE] Building structure tree..." -ForegroundColor Yellow
$treeString = Get-ProjectTree -RootPath $projectRoot -MaxDepth 4

Write-Host "[BUILD] Building JSON structure..." -ForegroundColor Yellow

$filesArray = @()
$fileIndex = 0
$largeFiles = @()

foreach ($file in $includedFiles) {
    $fileIndex++
    $relativePath = $file.FullName.Substring($projectRoot.Path.Length + 1).Replace('\', '/')
    $sizeKB = [math]::Round($file.Length / 1024, 1)

    if ($sizeKB -gt $MAX_FILE_SIZE_KB) {
        $largeFiles += "$relativePath ($sizeKB KB)"
    }

    try {
        $fileContent = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $lineCount = ($fileContent -split "`n").Count
    } catch {
        Write-Host "[WARN] Failed to read: $relativePath" -ForegroundColor Yellow
        continue
    }

    $langHint = Get-LanguageHint -Extension $file.Extension.ToLower()

    if ($fileIndex % 5 -eq 0 -or $fileIndex -eq $includedFiles.Count) {
        Write-Host "  [$fileIndex/$($includedFiles.Count)] $relativePath" -ForegroundColor DarkGray
    }

    $filesArray += [ordered]@{
        path = $relativePath
        language = $langHint
        size_bytes = $file.Length
        size_readable = Format-FileSize $file.Length
        lines = $lineCount
        content = $fileContent
    }
}

$jsonObject = [ordered]@{
    project = "Plan Zmian"
    description = "PWA for shift schedule management (4 brigades, P and G factory)"
    generated = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    profile = $Profile
    git = [ordered]@{
        branch = $gitInfo.Branch
        commit = $gitInfo.Commit
        status = $gitInfo.Status
    }
    stats = [ordered]@{
        files_included = $includedFiles.Count
        files_excluded = $excludedCount
        total_size_bytes = $totalSize
        total_size_readable = Format-FileSize $totalSize
    }
    ai_instructions = @(
        "Read docs/AGENT.md first (in files[]) - contains critical project rules including section 21 lessons learned",
        "NO ES modules - use window.myFunc = myFunc pattern",
        "Preserve UTF-8 literally (Polish/Ukrainian) - never escape as unicode",
        "This project is edited via Cline (VS Code extension) - AI generates task descriptions, Cline executes",
        "This export uses profile '$Profile' - some files may be intentionally missing (see profile description)"
    )
    project_structure = $treeString
    large_files = $largeFiles
    files = $filesArray
}

Write-Host "[CONVERT] Converting to JSON..." -ForegroundColor Yellow

$jsonString = $jsonObject | ConvertTo-Json -Depth 15 -Compress:$false

Write-Host "[SAVE] Writing to $OUTPUT_FILE..." -ForegroundColor Yellow

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $projectRoot $OUTPUT_FILE),
    $jsonString,
    $utf8NoBom
)

$outputSize = (Get-Item (Join-Path $projectRoot $OUTPUT_FILE)).Length

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " EXPORT COMPLETE ($Profile)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "Output: $OUTPUT_FILE ($(Format-FileSize $outputSize))" -ForegroundColor White
Write-Host "Files: $($includedFiles.Count)" -ForegroundColor White
Write-Host "MIME type: application/json (allowed by chat)" -ForegroundColor Green

if ($outputSize -gt 10485760) {
    Write-Host ""
    Write-Host "[WARN] File exceeds 10 MB!" -ForegroundColor Red
} elseif ($outputSize -gt 5242880) {
    Write-Host ""
    Write-Host "[INFO] File is large ($(Format-FileSize $outputSize))" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Upload $OUTPUT_FILE to chat" -ForegroundColor Gray
Write-Host "  2. AI reads .files array and answers your questions" -ForegroundColor Gray
Write-Host "  3. Use Cline (VS Code) to apply changes" -ForegroundColor Gray
Write-Host "  4. Verify: git diff, test in browser, commit" -ForegroundColor Gray
Write-Host ""
Write-Host "Other profiles:" -ForegroundColor Cyan
Write-Host "  .\tools\export-code.ps1 -h    for details" -ForegroundColor Gray
Write-Host ""