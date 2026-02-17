#!/usr/bin/env bash
#
# upload-candidate-photos.sh - Upload candidate photos to VPS
#
# Usage:
#   ./scripts/upload-candidate-photos.sh
#
# This script:
# 1. Creates the /srv/uploads/candidates directory on VPS
# 2. Copies the candidate photos from apps/web/public to VPS
#

set -euo pipefail

# Configuration
VPS_HOST="${VPS_HOST:-161.132.39.165}"
VPS_USER="${VPS_USER:-deploy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="/srv/uploads/candidates"

# Source photos (local)
LOCAL_PHOTOS=(
  "apps/web/public/2guillermo.jpg:guillermo-aliaga.jpg"
  "apps/web/public/Rocio-Porras.jpg:rocio-porras.jpg"
  "apps/web/public/giovanna-castagnino.jpg:giovanna-castagnino.jpg"
)

echo "=== Uploading candidate photos to VPS ==="
echo "Host: $VPS_HOST"
echo "User: $VPS_USER"
echo "Remote dir: $REMOTE_DIR"
echo ""

# Create remote directory
echo "Creating remote directory..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "sudo mkdir -p $REMOTE_DIR && sudo chown $VPS_USER:$VPS_USER $REMOTE_DIR"

# Upload each photo
for entry in "${LOCAL_PHOTOS[@]}"; do
  LOCAL_PATH="${entry%%:*}"
  REMOTE_NAME="${entry##*:}"
  
  if [[ -f "$LOCAL_PATH" ]]; then
    echo "Uploading: $LOCAL_PATH → $REMOTE_DIR/$REMOTE_NAME"
    scp -i "$SSH_KEY" "$LOCAL_PATH" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/$REMOTE_NAME"
  else
    echo "WARNING: File not found: $LOCAL_PATH"
  fi
done

# Set permissions
echo ""
echo "Setting permissions..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "chmod 644 $REMOTE_DIR/*.jpg 2>/dev/null || true"

echo ""
echo "=== Upload complete ==="
echo ""
echo "Photos available at:"
for entry in "${LOCAL_PHOTOS[@]}"; do
  REMOTE_NAME="${entry##*:}"
  echo "  http://$VPS_HOST/uploads/candidates/$REMOTE_NAME"
done
