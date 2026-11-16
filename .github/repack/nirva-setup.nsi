; Nirva for Windows: a per-user installer (no administrator rights needed).
; Build: makensis -DVERSION=0.1.0 -DSRC=path/to/nirva -DICON=nirva.ico -DOUT=Nirva-setup.exe nirva-setup.nsi
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

Name "Nirva"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Nirva"
ShowInstDetails nevershow

!include "MUI2.nsh"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\nirva.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Nirva"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nirva"

Section "Nirva"
  SetOutPath "$INSTDIR"
  File /r "${SRC}/*"
  WriteUninstaller "$INSTDIR\uninstall-nirva.exe"
  CreateShortcut "$SMPROGRAMS\Nirva.lnk" "$INSTDIR\nirva.exe"
  CreateShortcut "$DESKTOP\Nirva.lnk" "$INSTDIR\nirva.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Nirva"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Nirva"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\nirva.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall-nirva.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Nirva.lnk"
  Delete "$DESKTOP\Nirva.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
