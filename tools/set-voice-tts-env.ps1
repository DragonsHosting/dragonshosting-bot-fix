$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

function Read-TokenValue {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Prompt
    )

    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$mainToken = Read-TokenValue "Main BOT_TOKEN"
$clientId = Read-Host -Prompt "Main CLIENT_ID"
$tts1 = Read-TokenValue "VOICE_TTS_WORKER_TOKEN_1"
$tts2 = Read-TokenValue "VOICE_TTS_WORKER_TOKEN_2"
$tts3 = Read-TokenValue "VOICE_TTS_WORKER_TOKEN_3"
$tts4 = Read-TokenValue "VOICE_TTS_WORKER_TOKEN_4"

$lines = @(
    "BOT_TOKEN=$mainToken",
    "CLIENT_ID=$clientId",
    "VOICE_TTS_WORKER_TOKEN_1=$tts1",
    "VOICE_TTS_WORKER_TOKEN_2=$tts2",
    "VOICE_TTS_WORKER_TOKEN_3=$tts3",
    "VOICE_TTS_WORKER_TOKEN_4=$tts4"
)

Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8
Write-Host "Wrote $envPath"
