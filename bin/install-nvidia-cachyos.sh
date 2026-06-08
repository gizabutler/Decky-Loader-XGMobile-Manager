#!/bin/bash
# CachyOS NVIDIA open-source driver installer via pacman
# No bind-mounts needed — CachyOS has a mutable root filesystem.
LOG_DIR=$1
DATA_DIR=$2
PRIMARY_USER=$(ps -o user= -C steam | head -n 1 | xargs)
[ -z "$PRIMARY_USER" ] && PRIMARY_USER="$(ls /home | head -n 1)"
REPO_ROOT=$(readlink -f "$(dirname "$(readlink -f "$0")")/..")

exec > "$LOG_DIR/xgmobile_manager_install.log" 2>&1
echo "--- CachyOS NVIDIA Install Started at $(date) ---"

# Already installed?
if modinfo nvidia >/dev/null 2>&1; then
    VERSION=$(modinfo nvidia | grep "^version:" | awk '{print $2}')
    echo "ALREADY_INSTALLED NVIDIA Driver $VERSION matched to current kernel."
    exit 1
fi

echo "Syncing pacman database..."
pacman -Sy >/dev/null 2>&1 || { echo "ERROR: pacman sync failed."; exit 2; }

echo "Installing nvidia-open-dkms and dependencies..."
if ! pacman -S --noconfirm --needed nvidia-open-dkms nvidia-utils lib32-nvidia-utils egl-wayland 2>&1; then
    echo "ERROR: pacman install failed. Check network/mirrors."
    exit 3
fi

# Verify DKMS built for running kernel
KVER=$(uname -r)
echo "Verifying DKMS module for kernel $KVER..."
if ! dkms status | grep -q "nvidia.*installed"; then
    NVIDIA_VER=$(pacman -Q nvidia-open-dkms | awk '{print $2}' | cut -d'-' -f1)
    echo "Attempting manual DKMS build for nvidia/$NVIDIA_VER..."
    if ! dkms install nvidia/"$NVIDIA_VER" --kernelver "$KVER"; then
        echo "ERROR: DKMS build failed."
        exit 4
    fi
fi

echo "Writing modprobe configuration..."
mkdir -p /etc/modprobe.d
cat > /etc/modprobe.d/nvidia-egpu.conf << 'EOF'
options nvidia_drm modeset=1 fbdev=1
options nvidia NVreg_RegistryDwords="PowerMizerEnable=0x1; PerfStrategy=0x1; PowerMizerDefaultAC=0x1"
options nvidia NVreg_PreserveVideoMemoryAllocations=1
options nvidia NVreg_TemporaryFilePath=/var/tmp
EOF

echo "De-fanging NVIDIA configs to protect AMD handheld mode..."
mkdir -p "$DATA_DIR/configs_backup"
mv /usr/share/glvnd/egl_vendor.d/*nvidia*        "$DATA_DIR/configs_backup/" 2>/dev/null || true
mv /usr/share/vulkan/implicit_layer.d/*nvidia*   "$DATA_DIR/configs_backup/" 2>/dev/null || true
mv /usr/share/vulkan/explicit_layer.d/*nvidia*   "$DATA_DIR/configs_backup/" 2>/dev/null || true
mv /usr/share/vulkan/icd.d/*nvidia*              "$DATA_DIR/configs_backup/" 2>/dev/null || true
mv /usr/share/X11/xorg.conf.d/10-nvidia*         "$DATA_DIR/configs_backup/" 2>/dev/null || true
mv /etc/X11/xorg.conf.d/*nvidia*                 "$DATA_DIR/configs_backup/" 2>/dev/null || true

echo "Rebuilding initramfs..."
mkinitcpio -P 2>&1 || echo "WARNING: initramfs rebuild had issues, proceeding."

echo "Installing symlinks and services..."
ln -sf "$REPO_ROOT/bin/egpu-enable" /usr/local/bin/egpu-enable
ln -sf "$REPO_ROOT/bin/egpu-eject"  /usr/local/bin/egpu-eject
chmod +x "$REPO_ROOT/bin/egpu-enable" "$REPO_ROOT/bin/egpu-eject"
cp "$REPO_ROOT/assets/services/"*.service /etc/systemd/system/ 2>/dev/null || true
systemctl daemon-reload
systemctl enable xgmobile-boot-sync.service 2>/dev/null || true
systemctl enable nvidia-persistenced nvidia-powerd 2>/dev/null || true
systemctl enable nvidia-suspend.service nvidia-hibernate.service nvidia-resume.service 2>/dev/null || true

echo "--- CachyOS NVIDIA Install Complete ---"
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "---  PLEASE REBOOT TO ACTIVATE THE NVIDIA DRIVER  ---"
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
