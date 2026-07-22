Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-HexSecret([int]$ByteCount) {
    $bytes = [byte[]]::new($ByteCount)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

function New-FernetKey {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot 'compose.local.yaml'
$localEnvFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $localEnvFile)) {
    $mysqlRootPassword = New-HexSecret 24
    $mysqlPassword = New-HexSecret 24
    $jwtSecret = New-HexSecret 48
    $fieldEncryptionKey = New-FernetKey
    $content = @"
MYSQL_HOST_PORT=13306
BACKEND_HOST_PORT=15001
FRONTEND_HOST_PORT=15173
MOCK_WECOM_HOST_PORT=19090
MYSQL_DATABASE=zhipin
MYSQL_USER=zhipin
MYSQL_ROOT_PASSWORD=$mysqlRootPassword
MYSQL_PASSWORD=$mysqlPassword
JWT_SECRET=$jwtSecret
FIELD_ENCRYPTION_KEY=$fieldEncryptionKey
LOCAL_HR_EMAIL=hr.local@example.test
LOCAL_INTERVIEWER_EMAIL=interviewer.local@example.test
LOCAL_DEMO_PASSWORD=ZhipinLocal2026!
"@
    [IO.File]::WriteAllText(
        $localEnvFile,
        $content,
        [Text.UTF8Encoding]::new($false)
    )
    Write-Host '已生成本地 .env；文件已被 Git 忽略。'
}

$composeArgs = @('--env-file', $localEnvFile, '--file', $composeFile)
& docker compose @composeArgs up --build --detach --wait
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose 启动失败'
}

& docker compose @composeArgs exec --no-TTY zhipin-server python scripts/bootstrap_local_accounts.py
if ($LASTEXITCODE -ne 0) {
    throw '本地验收账号准备失败'
}

& docker compose @composeArgs ps
Write-Host '前端：http://127.0.0.1:15173'
Write-Host '招聘专员：hr.local@example.test / ZhipinLocal2026!'
Write-Host '面试官：interviewer.local@example.test / ZhipinLocal2026!'
