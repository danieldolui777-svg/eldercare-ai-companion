# Test du flow complet Milestone 1
# Lance ce script avec : .\test-flow.ps1

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

# ============================================================
Step "1. Creer un resident"
# ============================================================

$residentBody = @{
    firstName     = "Alice"
    preferredName = "Memee Alice"
    dateOfBirth   = "1940-05-10"
    language      = "fr"
    consentStatus = "granted"
    privacySettings = @{
        storeAudio          = $false
        storeTranscripts    = $false
        shareDataWithFamily = $true
        allowAiConversation = $true
    }
} | ConvertTo-Json -Depth 3

$resident = Invoke-RestMethod -Uri "$base/residents" -Method Post -Body $residentBody -Headers $headers
$residentId = $resident.id
OK "Resident cree : $($resident.firstName) (id: $residentId)"

# ============================================================
Step "2. Creer un medicament"
# ============================================================

$medBody = @{
    residentId             = $residentId
    name                   = "Doliprane"
    dosageLabel            = "500 mg"
    instructionsLabel      = "A prendre avec un verre d eau"
    prescribingSourceLabel = "Dr. Bernard - ordonnance 2026-01-10"
    active                 = $true
} | ConvertTo-Json

$med = Invoke-RestMethod -Uri "$base/medications" -Method Post -Body $medBody -Headers $headers
$medId = $med.id
OK "Medicament cree : $($med.name) $($med.dosageLabel) (id: $medId)"

# ============================================================
Step "3. Creer un schedule (rappel quotidien a 08h00)"
# ============================================================

$schedBody = @{
    medicationId   = $medId
    residentId     = $residentId
    timeOfDay      = "08:00"
    recurrenceRule = "FREQ=DAILY"
    startDate      = (Get-Date).ToString("yyyy-MM-dd")
    active         = $true
} | ConvertTo-Json

$sched = Invoke-RestMethod -Uri "$base/medication-schedules" -Method Post -Body $schedBody -Headers $headers
$schedId = $sched.id
OK "Schedule cree : $($sched.timeOfDay) chaque jour (id: $schedId)"

# ============================================================
Step "4. Le scheduler cree un reminder event (simule)"
# ============================================================

$eventBody = @{
    medicationScheduleId = $schedId
    scheduledAt          = (Get-Date).ToString("o")
} | ConvertTo-Json

$event = Invoke-RestMethod -Uri "$base/reminder-events" -Method Post -Body $eventBody -Headers $headers
$eventId = $event.id
OK "Reminder event cree : status = $($event.status) (id: $eventId)"

# ============================================================
Step "5a. Scenario : resident dit PRIS -> pas d alerte"
# ============================================================

$confirm1 = @{
    eventId           = $eventId
    status            = "confirmed_taken"
    transcriptSnippet = "Oui j ai pris mes medicaments"
} | ConvertTo-Json

$alertsAvant = (Invoke-RestMethod -Uri "$base/alerts" -Method Get -Headers $headers).Count

$result1 = Invoke-RestMethod -Uri "$base/voice-events/confirm" -Method Post -Body $confirm1 -Headers $headers
OK "Confirmation : $($result1.status)"

$alertsApres = (Invoke-RestMethod -Uri "$base/alerts" -Method Get -Headers $headers).Count
if ($alertsApres -eq $alertsAvant) {
    OK "Aucune nouvelle alerte cree (correct : medicament pris)"
} else {
    FAIL "Une alerte a ete cree alors que le medicament etait pris"
}

# ============================================================
Step "5b. Nouveau scenario : resident dit PAS PRIS -> alerte medium"
# ============================================================

$event2 = Invoke-RestMethod -Uri "$base/reminder-events" -Method Post -Body $eventBody -Headers $headers
$eventId2 = $event2.id
INFO "Nouvel event cree : $eventId2"

$confirm2 = @{
    eventId           = $eventId2
    status            = "confirmed_not_taken"
    transcriptSnippet = "Non je n ai pas pris mon medicament"
} | ConvertTo-Json

$result2 = Invoke-RestMethod -Uri "$base/voice-events/confirm" -Method Post -Body $confirm2 -Headers $headers
OK "Confirmation : $($result2.status)"

$alerts2 = Invoke-RestMethod -Uri "$base/alerts" -Method Get -Headers $headers
$alert = $alerts2 | Where-Object { $_.type -eq "missed_medication" } | Select-Object -First 1
if ($alert) {
    OK "Alerte creee : [$($alert.severity.ToUpper())] $($alert.type)"
    INFO "Message : $($alert.message)"
    $alertId = $alert.id
} else {
    FAIL "Aucune alerte creee alors qu elle etait attendue"
    $alertId = $null
}

# ============================================================
Step "5c. Nouveau scenario : resident dit JE SAIS PAS -> alerte uncertainty"
# ============================================================

$event3 = Invoke-RestMethod -Uri "$base/reminder-events" -Method Post -Body $eventBody -Headers $headers
$eventId3 = $event3.id

$confirm3 = @{
    eventId           = $eventId3
    status            = "unknown"
    transcriptSnippet = "Je ne sais plus si j ai pris"
} | ConvertTo-Json

$result3 = Invoke-RestMethod -Uri "$base/voice-events/confirm" -Method Post -Body $confirm3 -Headers $headers
OK "Confirmation : $($result3.status)"

$alerts3 = Invoke-RestMethod -Uri "$base/alerts" -Method Get -Headers $headers
$alert3 = $alerts3 | Where-Object { $_.type -eq "medication_uncertainty" } | Select-Object -First 1
if ($alert3) {
    OK "Alerte creee : [$($alert3.severity.ToUpper())] $($alert3.type)"
    INFO "Message : $($alert3.message)"
} else {
    FAIL "Aucune alerte uncertainty creee"
}

# ============================================================
Step "6. Le soignant acquitte l alerte"
# ============================================================

if ($alertId) {
    $ackBody = @{ caregiverId = "test-caregiver-001" } | ConvertTo-Json
    $acked = Invoke-RestMethod -Uri "$base/alerts/$alertId/acknowledge" -Method Post -Body $ackBody -Headers $headers
    OK "Alerte acquittee : status = $($acked.status)"
    INFO "acknowledgedAt = $($acked.acknowledgedAt)"
} else {
    INFO "Pas d alerte a acquitter (etape ignoree)"
}

# ============================================================
Step "7. Alertes encore actives (non acquittees)"
# ============================================================

$finalAlerts = Invoke-RestMethod -Uri "$base/alerts" -Method Get -Headers $headers
INFO "Alertes encore actives : $($finalAlerts.Count)"
foreach ($a in $finalAlerts) {
    Write-Host "    [$($a.severity.ToUpper())] $($a.type) -- $($a.status)" -ForegroundColor White
}

# ============================================================
Step "8. Tous les residents en base"
# ============================================================

$residents = Invoke-RestMethod -Uri "$base/residents" -Method Get -Headers $headers
OK "Residents en base : $($residents.Count)"
foreach ($r in $residents) {
    Write-Host "    - $($r.firstName) ($($r.consentStatus))" -ForegroundColor White
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  FLOW COMPLET TERMINE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
