$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

$Context = Get-Content "seed_context.json" | ConvertFrom-Json
$CustomerID = $Context.CustomerID
$TradieID = $Context.TradieID
$ThirdID = $Context.ThirdID
$JobID = "c45910f2-6405-4f91-9bc9-1ecca4041a0f"

function Get-Token {
    param ($Email, $Password)
    try {
        $Body = @{ email = $Email; password = $Password } | ConvertTo-Json
        $Res = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body $Body
        return $Res.access_token
    }
    catch {
        Write-Host "Auth failed for $Email"
        return $null
    }
}

$CustToken = Get-Token "test@tradiehub.com" "testpassword123"
$TradieToken = Get-Token "tradie_test@tradiehub.com" "TradieTest123!"
$ThirdToken = Get-Token "third_test@tradiehub.com" "ThirdTest123!"

function Check-Assignment {
    param ($Token, $Name)
    $H = $HEADERS.Clone()
    $H["Authorization"] = "Bearer $Token"
    try {
        $Res = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments?job_id=eq.$JobID" -Method Get -Headers $H
        if ($Res.Count -gt 0) {
            Write-Host "[$Name] SEES assignment: YES"
            return $Res[0]
        }
        else {
            Write-Host "[$Name] SEES assignment: NO"
            return $null
        }
    }
    catch {
        Write-Host "[$Name] Error checking assignment: $($_.Exception.Message)"
        return $null
    }
}

Write-Host "`n--- VERIFYING ASSIGNMENTS ---"
$A_Cust = Check-Assignment $CustToken "Customer"
$A_Tradie = Check-Assignment $TradieToken "Tradie"
$A_Third = Check-Assignment $ThirdToken "Third"

if ($A_Cust) {
    Write-Host "`nParticipant Check:"
    Write-Host "Customer ID Match: $(If ($A_Cust.customer_id -eq $CustomerID) {'PASS'} Else {'FAIL - ' + $A_Cust.customer_id + ' vs ' + $CustomerID})"
    Write-Host "Tradie ID Match:   $(If ($A_Cust.tradie_id -eq $TradieID) {'PASS'} Else {'FAIL - ' + $A_Cust.tradie_id + ' vs ' + $TradieID})"
}
else {
    Write-Host "CRITICAL: Customer cannot see assignment. RLS or Zombie Data?"
}

Write-Host "`n--- VERIFYING CONVERSATIONS ---"
# Check if Conversation Exists via Customer
$H_Cust = $HEADERS.Clone()
$H_Cust["Authorization"] = "Bearer $CustToken"
$Convs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations?user2_id=eq.$TradieID" -Method Get -Headers $H_Cust
if ($Convs.Count -gt 0) {
    $ConvID = $Convs[0].id
    Write-Host "Conversation Found: $ConvID"
    $Context | Add-Member -NotePropertyName "ConversationID" -NotePropertyValue $ConvID -Force
    
    # Check Mapping
    $Maps = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversation_jobs?job_id=eq.$JobID" -Method Get -Headers $H_Cust
    if ($Maps.Count -gt 0) {
        Write-Host "Conversation Linked to Job: YES"
    }
    else {
        Write-Host "Conversation Linked to Job: NO (Attempting link...)"
        try {
            $Body = @{ conversation_id = $ConvID; job_id = $JobID } | ConvertTo-Json
            Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversation_jobs" -Method Post -Headers $H_Cust -Body $Body
            Write-Host "Link Created."
        }
        catch { Write-Host "Link failed: $($_.Exception.Message)" }
    }
}
else {
    Write-Host "Conversation NOT Found."
    $Context | Add-Member -NotePropertyName "ConversationID" -NotePropertyValue "NOT FOUND" -Force
}

$Context | ConvertTo-Json | Out-File "seed_context.json"
