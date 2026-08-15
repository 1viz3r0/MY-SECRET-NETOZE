NET0ZE v2.0.0 MSI INSTALLER
----------------------------

MSI is provided for advanced/system-managed installation
(for example, deployment via Intune/Group Policy/silent scripts).

Most users should use the NSIS installer in folder "01 - INSTALL NET0ZE"
instead (simpler, installs for the current user and creates the
Start Menu shortcut automatically).

Silent MSI example:
  msiexec /i "NET0ZE v2.0.0.msi" /qn