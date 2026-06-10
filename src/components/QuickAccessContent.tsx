import React, { useState, useEffect } from "react";
import { 
  ButtonItem, 
  Spinner, 
  showModal, 
  ConfirmModal,
  ToggleField, 
  PanelSection, 
  PanelSectionRow,
  Focusable,
  Dropdown
} from "@decky/ui";
import { call, toaster } from "@decky/api";
import { LiveLogViewerModal } from "./LiveLogViewerModal";
import { LogViewerModal } from "./LogViewerModal";

// Helper for UI styling
const statsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "4px",
  padding: "6px",
  backgroundColor: "rgba(0,0,0,0.2)",
  borderRadius: "4px",
  marginBottom: "10px"
};

export const QuickAccessContent = () => {
  const [needsReboot, setNeedsReboot] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [pluginVersion, setPluginVersion] = useState("Loading...");
  //const [hasSupergfxctl, setHasSupergfxctl] = useState<boolean>(false);
  const [deviceType, setDeviceType] = useState<string>("unknown");
  //const [daemonActive, setDaemonActive] = useState<boolean>(true);
  
  // Dynamic State from Backend
  const [gpuStatus, setGpuStatus] = useState({ connected: false, active: false, vendor: "none" });
  const [telemetry, setTelemetry] = useState({ temp: "--", power: "--", vram: "--", util: "--" });
  const [selectedVendor, setSelectedVendor] = useState("nvidia");
  const [selectedDesktopMode, setSelectedDesktopMode] = useState("0");
  const [selectedDesktopDefault, setSelectedDesktopDefault] = useState("0");
  const [osType, setOsType] = useState("steamos");
  const [powerProfile, setPowerProfile] = useState("Unknown");
  const showSleepWarning = gpuStatus.active && selectedVendor === 'nvidia' && (osType.includes('bazzite') || osType === 'cachyos');

  // 1. Initial Load: Fetch Vendor Setting once
  useEffect(() => {
    const init = async () => {
      try {
        const val = await call("get_setting", "gpu_vendor", "nvidia") as string;
        setSelectedVendor(val);
        const desktopmode = await call("get_setting", "desktop_mode", "0") as string;
        setSelectedDesktopMode(desktopmode);
        const desktopdefault = await call("get_setting", "desktop_default", "0") as string;
        setSelectedDesktopDefault(desktopdefault);
        const ver = await call("get_version") as string;
        if (ver) setPluginVersion(ver);
        const os = await call("get_os_status") as string;
        setOsType(os);
        // call() returns the boolean directly from Python
        //const hasSgfx = await call("has_supergfxctl") as boolean;
        //setHasSupergfxctl(hasSgfx);
        const device = await call("get_device_type") as string;
        setDeviceType(device);
      } catch (e) { 
        console.error("Init Error:", e); 
      }
    };
    init();
  }, []);

  // 2. The Polling Loop: Only fetches hardware/telemetry
  useEffect(() => {
    const poll = async () => {
      try {
        const currentStatus = await call("get_gpu_status") as any;
        if (currentStatus) setGpuStatus(currentStatus);
        if (currentStatus?.active) {
          const stats = await call("get_telemetry") as any;
          if (stats) setTelemetry(stats);
        }
        const prof = await call("get_power_profile") as string;
        setPowerProfile(prof);
      } catch (e) {
        console.error("Poll Error:", e);
      }
    };

    poll(); 
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (method: string, label: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setStatusText(label);
    toaster.toast({ title: "XG Mobile", body: `Starting: ${label}...` });

    try {
      if (selectedDesktopMode === "1" && method === "enable_egpu") {
        //toaster.toast({ title: "Debug", body: "1. React is calling Python..." });
        
        const flagResult = await call("set_desktop_transition_flag") as string;
        
        toaster.toast({ title: "DesktopMode", body: `Setting Desktop Flag: ${flagResult}` });
        
        //await new Promise(resolve => setTimeout(resolve, 3000));
      }
      const result = await call(method);
      toaster.toast({ title: "XG Mobile", body: `${label} Result: ${result}` });
      const newStatus = await call("get_gpu_status") as any;
      setGpuStatus(newStatus);
    } catch (e) {
      toaster.toast({ title: "Error", body: "Action failed." });
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  const handleInstall = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setStatusText("Installing");

    showModal(<LiveLogViewerModal logType="install" />);

    try {
      const result = (await call("install_nvidia")) as string;
      if (result.includes("ALREADY_INSTALLED")) {
        toaster.toast({ 
          title: "NVIDIA Setup", 
          body: "Drivers are already installed. No reboot required.", 
          duration: 4000 
        });
      } else if (result.includes("Failed") || result.includes("Error")) {
        toaster.toast({ 
          title: "NVIDIA Setup", 
          body: "Installation failed. Check the logs.", 
          duration: 5000 
        });
      } else {
        showModal(
          <ConfirmModal
            strTitle="Installation Complete"
            strDescription="The NVIDIA drivers were successfully installed. The system must reboot. Reboot now?"
            strOKButtonText="Restart Now"
            onOK={() => { call("reboot_system"); }}
            strCancelButtonText="Restart Later"
          />
        );
      }
    } catch (e) {
      toaster.toast({ title: "Error", body: "Plugin communication failed." });
    } finally {
      setIsLoading(false);
    }
  };

  const enableSuperGfxd = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setStatusText("Restarting Daemon");
    toaster.toast({ title: "Flow Controls", body: "Restarting supergfxd..." });

    try {
      const result = await call("restart_supergfxd") as string;
      if (result === "Success") {
        toaster.toast({ title: "Flow Controls", body: "Daemon restarted successfully." });
      } else {
        toaster.toast({ title: "Error", body: result });
      }
    } catch (e) {
      toaster.toast({ title: "Error", body: "Action failed." });
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };
  const toggleVendor = async (val: boolean) => {
    const newVendor = val ? "nvidia" : "amd";
    setSelectedVendor(newVendor);
    await call("set_setting", "gpu_vendor", newVendor ) as string;
  };
  const toggleDesktopMode = async (val: boolean) => {
    const newDesktopMode = val ? "1" : "0";
    setSelectedDesktopMode(newDesktopMode);
    await call("set_setting", "desktop_mode", newDesktopMode ) as string;
    //If they turned off the BootToDesktop, lets turn off DesktopDefault as well. 
    if (newDesktopMode === "0") {
      setSelectedDesktopDefault(newDesktopMode);
      await call("set_setting", "desktop_default", newDesktopMode ) as string;
    }
  };
  const toggleDesktopDefault = async (val: boolean) => {
    const newDesktopDefault = val ? "1" : "0";
    setSelectedDesktopDefault(newDesktopDefault);
    await call("set_setting", "desktop_default", newDesktopDefault ) as string;
  };

  const onResetClick = () => {
    showModal(
      <ConfirmModal
        strTitle="Reset Driver Environment?"
        strDescription="This will purge the NVIDIA driver stack and all filesystem redirects from SteamOS. Continue?"
        strOKButtonText="Purge & Reset"
        onOK={() => { 
          setTimeout(async () => {
            setIsLoading(true);
            showModal(<LiveLogViewerModal logType="uninstall" />);
            try {
              const result = await call("uninstall_nvidia") as string;
              if (result !== "Success") {
                toaster.toast({ title: "Reset Error", body: result });
              } else {
                showModal(
                  <ConfirmModal
                    strTitle="Reset Complete"
                    strDescription="The environment has been purged. You must reboot. Reboot now?"
                    strOKButtonText="Restart Now"
                    onOK={() => { call("reboot_system"); }}
                    strCancelButtonText="Restart Later"
                  />
                );
              }
            } catch (e) {
              toaster.toast({ title: "Error", body: "Backend unreachable." });
            } finally {
              setIsLoading(false);
            }
          }, 200);
        }}
      />
    );
  };

  // If the installation was successful, trap the user in this pure @decky/ui state
  if (needsReboot) {
    return (
      <PanelSection title="Reboot Required">
        <PanelSectionRow>
          <div style={{ marginBottom: "10px", fontSize: "14px" }}>
            The system must reboot to apply changes.
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem 
            onClick={async () => {
              await call("reboot_system");
            }}
          >
            Restart Now
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem 
            onClick={() => setNeedsReboot(false)}
          >
            Restart Later
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }
  return (
    <Focusable>
      {/* SECTION 1: Telemetry Dashboard (Only show if connected/active) */}
      {(gpuStatus.active) && (
        <PanelSection title="Performance Monitor">
          <div style={statsStyle}>
            <div>
              <small>Temperature</small>
              <div style={{ fontSize: "1.2em", fontWeight: "bold" }}>{telemetry.temp}</div>
            </div>
            <div>
              <small>Power Draw</small>
              <div style={{ fontSize: "1.2em", fontWeight: "bold" }}>{telemetry.power}</div>
            </div>
            <div>
              <small>VRAM Usage</small>
              <div style={{ fontSize: "1.2em", fontWeight: "bold" }}>{telemetry.vram}</div>
            </div>
            <div>
              <small>GPU Load</small>
              <div style={{ fontSize: "1.2em", fontWeight: "bold" }}>{telemetry.util}</div>
            </div>
          </div>
        </PanelSection>
      )}

      {/* OS NOTE: plain bazzite-deck — NVIDIA modules not bundled */}
      {(osType === "bazzite") && (selectedVendor === "nvidia") && (
        <PanelSection title="Bazzite Note">
          <PanelSectionRow>
            <div style={{ color: "#ffab40", fontSize: "13px", marginBottom: "10px" }}>
              <strong>Standard bazzite-deck detected.</strong><br/>
              NVIDIA modules are not bundled in this image. For NVIDIA XG Mobile support,
              reimage to <strong>bazzite-deck-nvidia</strong> — it keeps the AMD iGPU as the
              primary display and bundles the NVIDIA drivers for eGPU use.
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}
      {/* OS NOTE: bazzite-deck-nvidia — correct image, no install needed */}
      {(osType === "bazzite-nvidia") && (selectedVendor === "nvidia") && (
        <PanelSection title="Bazzite Note">
          <PanelSectionRow>
            <div style={{ color: "#88ccff", fontSize: "13px", marginBottom: "10px" }}>
              bazzite-deck-nvidia detected. No driver installation required — NVIDIA modules are
              managed by the OS image. Use the Enable button to load the eGPU for this session.
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}

      {/* UNIVERSAL ASUS WMI CONTROLS */}
      <PanelSection title="ASUS Hardware Controls">
        <PanelSectionRow>
          <div style={{ marginBottom: "6px", fontSize: "14px", opacity: 0.8 }}>
            Active Power Profile
          </div>
          {powerProfile === "Error" || powerProfile === "Unknown" ? (
            <div style={{ color: "#ffab40", fontSize: "12px", fontStyle: "italic", padding: "4px 0" }}>
              Unable to read motherboard WMI policy.
            </div>
          ) : (
            <Dropdown
              selectedOption={powerProfile}
              rgOptions={[
                { data: "Quiet", label: "Quiet" },
                { data: "Balanced", label: "Balanced" },
                { data: "Performance", label: "Performance" }
              ]}
              onChange={async (option: any) => {
                const newProfile = option.data;
                setPowerProfile(newProfile);
                await call("set_power_profile", { profile: newProfile });
                toaster.toast({ title: "ASUS Profile", body: `Set to ${newProfile}` });
              }}
            />
          )}
        </PanelSectionRow>
      </PanelSection>

      {/* SECTION 2: Controls */}
      <PanelSection title="Controls">
        {isLoading ? (
          <PanelSectionRow>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Spinner />
              <span style={{ marginLeft: "10px" }}>{statusText}...</span>
            </div>
          </PanelSectionRow>
        ) : (
          <>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                disabled={!gpuStatus.connected || gpuStatus.active || isLoading}
                onClick={() => handleAction("enable_egpu", "Enabling")}
              >
                {gpuStatus.active ? "XG Mobile is Active" : "Enable XG Mobile"}
              </ButtonItem>
            </PanelSectionRow>

            <PanelSectionRow>
              <ButtonItem
                layout="below"
                disabled={!gpuStatus.active || isLoading}
                onClick={() => handleAction("eject_egpu", "Ejecting")}
              >
                {gpuStatus.active ? "Eject XG Mobile" : "XG Mobile is not Active"}
              </ButtonItem>
            </PanelSectionRow>

            {showSleepWarning && (
              <PanelSectionRow>
                <div style={{
                  backgroundColor: 'rgba(255, 0, 0, 0.15)',
                  border: '1px solid #ff4444',
                  padding: '12px',
                  borderRadius: '6px',
                  color: '#ffdddd',
                  fontSize: '13px',
                  lineHeight: '1.4'
                }}>
                  <b>⚠️ CRITICAL SLEEP WARNING</b><br/>
                  Due to NVIDIA firmware limitations on this OS, putting the device to sleep right now will cause a fatal hardware crash requiring a hard reboot. <br/><br/>
                  <b>You must Eject the eGPU before sleeping.</b>
                </div>
              </PanelSectionRow>
            )}
            <PanelSectionRow>
              <ToggleField
                label="NVIDIA Mode"
                description="Turn off for AMD XG Mobile units"
                // Disable if the hardware is active
                disabled={gpuStatus.active || isLoading}
                checked={selectedVendor === "nvidia"}
                onChange={toggleVendor}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="DesktopMode on Enable"
                description="Turn on to reboot straight into Desktop Mode when running the Enable. Recommended for 4K and Ultrawide resolutions with NVIDIA GPUs."
                // Disable if the hardware is active
                disabled={gpuStatus.active || isLoading}
                checked={selectedDesktopMode === "1"}
                onChange={toggleDesktopMode}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="Set Desktop to Default"
                description="Turn on to set Desktop Mode to Default when running the XG Mobile. You MUST run the Eject Desktop Link to revert to GameMode."
                // Disable if the hardware is active
                disabled={gpuStatus.active || isLoading || selectedDesktopMode === "0"}
                checked={selectedDesktopDefault === "1"}
                onChange={toggleDesktopDefault}
              />
            </PanelSectionRow>
          </>
        )}
      </PanelSection>

      {/* SECTION 3: Maintenance */}
      <PanelSection title="Advanced">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            description="Create Desktop shortcuts for enabling and ejecting the XG Mobile. Run this after selecting Vender type and running Install NVIDIA Drivers if needed."
            disabled={isLoading}
            onClick={() => handleAction("create_desktop_shortcuts", "Creating Shortcuts")}
          >
            Create Desktop Shortcuts
          </ButtonItem>
        </PanelSectionRow>
        {/* Render Install button on SteamOS and CachyOS */}
        {(osType === "steamos" || osType === "cachyos") && (
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={gpuStatus.active || isLoading}
              onClick={handleInstall} 
            >
              Install NVIDIA Drivers
            </ButtonItem>
          </PanelSectionRow>
        )}
        {/* Render Reset button on SteamOS and CachyOS */}
        {(osType === "steamos" || osType === "cachyos") && (
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={gpuStatus.active || isLoading}
              onClick={onResetClick}
            >
              <span style={{ color: "#ff5555" }}>Reset Driver Environment</span>
            </ButtonItem>
          </PanelSectionRow>
        )}

        {/* SUPERGFXCTL CONTROLS */}
        {deviceType === "laptop" && (//{hasSupergfxctl && (
          <PanelSection title="Flow Laptop Controls">
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => enableSuperGfxd()}>
                Restart Supergfxd
              </ButtonItem>
              <ButtonItem
                layout="below"
                disabled={isLoading}
                onClick={() => handleAction("hybrid_supergfxctl", "Switching to Hybrid")}
              >
                Send Supergfxctl Hybrid command - beta
              </ButtonItem>
            </PanelSectionRow>

            <PanelSectionRow>
              <ButtonItem
                layout="below"
                disabled={isLoading}
                onClick={() => handleAction("integrated_supergfxctl", "Switching to Integrated")}
              >
                Send Supergfxctl Integrated command - beta
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        )}

        {/* Universal Debug Tools */}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => showModal(<LogViewerModal />)} 
          >
            View Activity Logs
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="About">
        <PanelSectionRow>
          <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.6, fontSize: "0.8em" }}>
            <span>Version</span>
            <span>{pluginVersion}</span>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ opacity: 0.6, fontSize: "0.8em" }}>
            Created by Kentronix
          </div>
        </PanelSectionRow>
      </PanelSection>
    </Focusable>
  );
};
