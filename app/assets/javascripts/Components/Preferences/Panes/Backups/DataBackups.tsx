import { isDesktopApplication } from '@/Utils'
import { alertDialog } from '@/Services/AlertService'
import {
  STRING_IMPORT_SUCCESS,
  STRING_INVALID_IMPORT_FILE,
  STRING_IMPORTING_ZIP_FILE,
  STRING_UNSUPPORTED_BACKUP_FILE_VERSION,
  StringImportError,
  STRING_E2E_ENABLED,
  STRING_LOCAL_ENC_ENABLED,
  STRING_ENC_NOT_ENABLED,
} from '@/Strings'
import { BackupFile } from '@standardnotes/snjs'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { WebApplication } from '@/UIModels/Application'
import { JSXInternal } from 'preact/src/jsx'
import TargetedEvent = JSXInternal.TargetedEvent
import { AppState } from '@/UIModels/AppState'
import { observer } from 'mobx-react-lite'
import {
  PreferencesGroup,
  PreferencesSegment,
  Title,
  Text,
  Subtitle,
} from '@/Components/Preferences/PreferencesComponents'
import { Button } from '@/Components/Button/Button'

type Props = {
  application: WebApplication
  appState: AppState
}

export const DataBackups = observer(({ application, appState }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImportDataLoading, setIsImportDataLoading] = useState(false)
  const {
    isBackupEncrypted,
    isEncryptionEnabled,
    setIsBackupEncrypted,
    setIsEncryptionEnabled,
    setEncryptionStatusString,
  } = appState.accountMenu

  const refreshEncryptionStatus = useCallback(() => {
    const hasUser = application.hasAccount()
    const hasPasscode = application.hasPasscode()

    const encryptionEnabled = hasUser || hasPasscode

    const encryptionStatusString = hasUser
      ? STRING_E2E_ENABLED
      : hasPasscode
      ? STRING_LOCAL_ENC_ENABLED
      : STRING_ENC_NOT_ENABLED

    setEncryptionStatusString(encryptionStatusString)
    setIsEncryptionEnabled(encryptionEnabled)
    setIsBackupEncrypted(encryptionEnabled)
  }, [application, setEncryptionStatusString, setIsBackupEncrypted, setIsEncryptionEnabled])

  useEffect(() => {
    refreshEncryptionStatus()
  }, [refreshEncryptionStatus])

  const downloadDataArchive = () => {
    application.getArchiveService().downloadBackup(isBackupEncrypted).catch(console.error)
  }

  const readFile = async (file: File): Promise<any> => {
    if (file.type === 'application/zip') {
      application.alertService.alert(STRING_IMPORTING_ZIP_FILE).catch(console.error)
      return
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)
          resolve(data)
        } catch (e) {
          application.alertService.alert(STRING_INVALID_IMPORT_FILE).catch(console.error)
        }
      }
      reader.readAsText(file)
    })
  }

  const performImport = async (data: BackupFile) => {
    setIsImportDataLoading(true)

    const result = await application.mutator.importData(data)

    setIsImportDataLoading(false)

    if (!result) {
      return
    }

    let statusText = STRING_IMPORT_SUCCESS
    if ('error' in result) {
      statusText = result.error.text
    } else if (result.errorCount) {
      statusText = StringImportError(result.errorCount)
    }
    void alertDialog({
      text: statusText,
    })
  }

  const importFileSelected = async (event: TargetedEvent<HTMLInputElement, Event>) => {
    const { files } = event.target as HTMLInputElement

    if (!files) {
      return
    }
    const file = files[0]
    const data = await readFile(file)
    if (!data) {
      return
    }

    const version = data.version || data.keyParams?.version || data.auth_params?.version
    if (!version) {
      await performImport(data)
      return
    }

    if (application.protocolService.supportedVersions().includes(version)) {
      await performImport(data)
    } else {
      setIsImportDataLoading(false)
      void alertDialog({ text: STRING_UNSUPPORTED_BACKUP_FILE_VERSION })
    }
  }

  // Whenever "Import Backup" is either clicked or key-pressed, proceed the import
  const handleImportFile = (event: TargetedEvent<HTMLSpanElement, Event> | KeyboardEvent) => {
    if (event instanceof KeyboardEvent) {
      const { code } = event

      // Process only when "Enter" or "Space" keys are pressed
      if (code !== 'Enter' && code !== 'Space') {
        return
      }
      // Don't proceed the event's default action
      // (like scrolling in case the "space" key is pressed)
      event.preventDefault()
    }

    ;(fileInputRef.current as HTMLInputElement).click()
  }

  return (
    <>
      <PreferencesGroup>
        <PreferencesSegment>
          <Title>Data Backups</Title>

          {!isDesktopApplication() && (
            <Text className="mb-3">
              Backups are automatically created on desktop and can be managed via the "Backups" top-level menu.
            </Text>
          )}

          <Subtitle>Download a backup of all your data</Subtitle>

          {isEncryptionEnabled && (
            <form className="sk-panel-form sk-panel-row">
              <div className="sk-input-group">
                <label className="sk-horizontal-group tight">
                  <input type="radio" onChange={() => setIsBackupEncrypted(true)} checked={isBackupEncrypted} />
                  <Subtitle>Encrypted</Subtitle>
                </label>
                <label className="sk-horizontal-group tight">
                  <input type="radio" onChange={() => setIsBackupEncrypted(false)} checked={!isBackupEncrypted} />
                  <Subtitle>Decrypted</Subtitle>
                </label>
              </div>
            </form>
          )}

          <Button variant="normal" onClick={downloadDataArchive} label="Download backup" className="mt-2" />
        </PreferencesSegment>
        <PreferencesSegment>
          <Subtitle>Import a previously saved backup file</Subtitle>

          <div class="flex flex-row items-center mt-3">
            <Button variant="normal" label="Import backup" onClick={handleImportFile} />
            <input type="file" ref={fileInputRef} onChange={importFileSelected} className="hidden" />
            {isImportDataLoading && <div className="sk-spinner normal info ml-4" />}
          </div>
        </PreferencesSegment>
      </PreferencesGroup>
    </>
  )
})
