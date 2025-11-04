Write-Output "[DEMO SCRIPT] Starting demo build script..."
Write-Output "[DEMO SCRIPT] Environment variables (if any):"
Write-Output "  IMAGE_NAME=$env:IMAGE_NAME"
Write-Output "  IMAGE_TAG=$env:IMAGE_TAG"
Write-Output "  REGISTRY_URL=$env:REGISTRY_URL"
Start-Sleep -Seconds 1
Write-Output "[DEMO SCRIPT] Doing some work..."
Start-Sleep -Seconds 1
Write-Output "[DEMO SCRIPT] Completed successfully."
exit 0