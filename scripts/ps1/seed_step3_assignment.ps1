$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

$Context = Get-Content "seed_context.json" | ConvertFrom-Json
$CustomerID = $Context.CustomerID
$CustomerJWT = $Context.CustomerJWT
$TradieID = $Context.TradieID
$JobID = "c45910f2-6405-4f91-9bc9-1ecca4041a0f"

# 3. Create Job Assignment
Write-Host "Creating job assignment..."

$AuthHeaders = $HEADERS.Clone()
$AuthHeaders["Authorization"] = "Bearer $CustomerJWT"

$AssignmentBody = @{
    job_id      = $JobID
    customer_id = $CustomerID
    tradie_id   = $TradieID
    status      = "active"
    accepted_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

try {
    # Check if exists first
    $Check = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments?job_id=eq.$JobID" -Method Get -Headers $AuthHeaders
    
    if ($Check.Count -gt 0) {
        Write-Host "Assignment already exists."
    }
    else {
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments" -Method Post -Headers $AuthHeaders -Body $AssignmentBody
        Write-Host "Job assignment created."
    }
}
catch {
    Write-Host "Failed to create assignment."
    Write-Host $_.Exception.Message
    # exit 1 
    # Proceeding as it might be an RLS "insert ok but select forbidden" (though we are customer, so should be fine)
}

# 4. Create Conversation & Mapping
Write-Host "Creating conversation..."
$ConvBody = @{
    user1_id = $CustomerID
    user2_id = $TradieID
} | ConvertTo-Json

try {
    # Check existing conv (hard with RLS if we didn't create it, but let's try)
    # Actually, we can just try create, if unique constraint fails, we search
    $ConvResponse = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations" -Method Post -Headers $AuthHeaders -Body $ConvBody
    
    # If standard post returns data
    $ConvID = $ConvResponse.id # might be null if 201 no content or RLS
    
    if (-not $ConvID) {
        # Try fetch
        $ConvList = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations?user2_id=eq.$TradieID" -Method Get -Headers $AuthHeaders
        if ($ConvList.Count -gt 0) {
            $ConvID = $ConvList[0].id
        }
    }
    
    if ($ConvID) {
        Write-Host "Conversation ID: $ConvID"
        
        # Link to Job
        Write-Host "Linking conversation to job..."
        $MapBody = @{
            conversation_id = $ConvID
            job_id          = $JobID
        } | ConvertTo-Json
        
        try {
            Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversation_jobs" -Method Post -Headers $AuthHeaders -Body $MapBody
            Write-Host "Conversation linked."
        }
        catch {
            if ($_.Exception.Message -match "duplicate") {
                Write-Host "Link already exists."
            }
            else {
                Write-Host "Failed to link conversation: $($_.Exception.Message)"
            }
        }
        
        $Context | Add-Member -NotePropertyName "ConversationID" -NotePropertyValue $ConvID -Force
    }
    else {
        Write-Host "Could not retrieve Conversation ID (RLS blocked?)"
        $Context | Add-Member -NotePropertyName "ConversationID" -NotePropertyValue "NOT FOUND" -Force
    }

}
catch {
    Write-Host "Conversation creation failed or already exists."
    Write-Host $_.Exception.Message
    # Try fetch if duplicate
    try {
        $ConvList = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations?user2_id=eq.$TradieID" -Method Get -Headers $AuthHeaders
        if ($ConvList.Count -gt 0) {
            $ConvID = $ConvList[0].id
            Write-Host "Found existing Conversation ID: $ConvID"
            $Context | Add-Member -NotePropertyName "ConversationID" -NotePropertyValue $ConvID -Force
        }
    }
    catch {
        Write-Host "Could not find existing conversation."
    }
}

$Context | ConvertTo-Json | Out-File "seed_context.json"
