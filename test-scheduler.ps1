# Test du scheduler Phase 2
# Lance ce script avec : .\test-scheduler.ps1

$base = "http://localhost:3000/api/v1"
$headers = @{ "Content-Type" = "application/json" }

function Step($msg) {
    Write-Host ""
    Write-Host "-------------------------------------------" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "-------------------------------------------" -ForegroundColor Cyan
}
function OK($msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function INFO($msg) { Write-Host "  ->  $msg" -ForegroundColor Yellow }

# Attendre que l API soit prete
Write-Host "Attente que l API soit prete..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        Invoke-RestMethod -Uri "$base/residents" -ErrorAction Stop | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) { Write-Host "API non disponible. Lance pnpm --filter @eldercare/api dev d abord." -ForegroundColor Red; exit 1 }

# ============================================================
Step "1. Generer les reminders du jour (comme le cron de nuit)"
# ============================================================

$gen = Invoke-RestMethod -Uri "$base/scheduler/generate" -Method Post -Headers $headers -Body "{}"
OK "Events generes : $($gen.generated) pour le $($gen.date)"

# ============================================================
Step "2. Verifier que les events existent pour Jeanne et Robert"
# ============================================================

$r1Events = Invoke-RestMethod -Uri "$base/residents/00000000-0000-0000-0000-000000000001/reminders" -Headers $headers
$r2Events = Invoke-RestMethod -Uri "$base/residents/00000000-0000-0000-0000-000000000002/reminders" -Headers $headers

INFO "Jeanne : $($r1Events.Count) events"
foreach ($e in $r1Events) {
    $medName = $e.medicationSchedule.medication.name
    Write-Host "    [$($e.status)] $($e.scheduledAt) - $medName" -ForegroundColor White
}
INFO "Robert : $($r2Events.Count) events"
foreach ($e in $r2Events) {
    $medName = $e.medicationSchedule.medication.name
    Write-Host "    [$($e.status)] $($e.scheduledAt) - $medName" -ForegroundColor White
}

# ============================================================
Step "3. Simuler : Jeanne repond PRISE pour son premier event"
# ============================================================

$scheduledEvent = $r1Events | Where-Object { $_.status -eq "scheduled" } | Select-Object -First 1
if ($scheduledEvent) {
    $confirmBody = @{
        eventId           = $scheduledEvent.id
        status            = "confirmed_taken"
        transcriptSnippet = "Oui j ai pris mes medicaments ce matin"
    } | ConvertTo-Json
    $confirmed = Invoke-RestMethod -Uri "$base/voice-events/confirm" -Method Post -Body $confirmBody -Headers $headers
    OK "Event confirme : $($confirmed.status) ($($scheduledEvent.medicationSchedule.medication.name))"
} else {
    INFO "Aucun event scheduled disponible pour Jeanne"
}

# ============================================================
Step "4. Simuler : detecter les events sans reponse (missed)"
# ============================================================

$alertsBefore = (Invoke-RestMethod -Uri "$base/alerts" -Headers $headers).Count
INFO "Alertes avant detection : $alertsBefore"

# Creer un event avec une heure dans le passe (30 min ago) pour simuler un missed
$oldSchedules = Invoke-RestMethod -Uri "$base/residents/00000000-0000-0000-0000-000000000002/schedules" -Headers $headers
if ($oldSchedules.Count -gt 0) {
    $pastTime = (Get-Date).AddMinutes(-30).ToString("o")
    $oldEventBody = @{
        medicationScheduleId = $oldSchedules[0].id
        scheduledAt          = $pastTime
    } | ConvertTo-Json
    $oldEvent = Invoke-RestMethod -Uri "$base/reminder-events" -Method Post -Body $oldEventBody -Headers $headers
    INFO "Event dans le passe cree : $($oldEvent.id) (schedule il y a 30 min)"

    # Declencher la detection
    Invoke-RestMethod -Uri "$base/scheduler/detect-missed" -Method Post -Headers $headers -Body "{}" | Out-Null
    OK "Detection lancee"

    # Verifier
    $alertsAfter = (Invoke-RestMethod -Uri "$base/alerts" -Headers $headers).Count
    $newAlerts = $alertsAfter - $alertsBefore
    if ($newAlerts -gt 0) {
        OK "$newAlerts nouvelle(s) alerte(s) creee(s) pour event sans reponse"
        $recentAlerts = Invoke-RestMethod -Uri "$base/alerts" -Headers $headers
        $recentAlerts | Select-Object -Last $newAlerts | ForEach-Object {
            Write-Host "    [$($_.severity.ToUpper())] $($_.type) -- $($_.message)" -ForegroundColor White
        }
    } else {
        FAIL "Aucune alerte creee pour l event sans reponse"
    }

    # Verifier le statut de l event
    $updatedEvents = Invoke-RestMethod -Uri "$base/residents/00000000-0000-0000-0000-000000000002/reminders" -Headers $headers
    $missedEvent = $updatedEvents | Where-Object { $_.id -eq $oldEvent.id } | Select-Object -First 1
    if ($missedEvent -and $missedEvent.status -eq "missed") {
        OK "Event bien marque comme missed"
    } else {
        FAIL "Event pas marque missed (status: $($missedEvent.status))"
    }
}

# ============================================================
Step "5. Idempotence : relancer generate ne cree pas de doublons"
# ============================================================

$gen2 = Invoke-RestMethod -Uri "$base/scheduler/generate" -Method Post -Headers $headers -Body "{}"
if ($gen2.generated -eq 0) {
    OK "Idempotence OK : 0 event cree (les events du jour existent deja)"
} else {
    FAIL "Des doublons ont ete crees : $($gen2.generated) events supplementaires"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  SCHEDULER PHASE 2 VALIDE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
