import { WebApplication } from '@/UIModels/Application'
import { createRef, JSX, RefObject } from 'preact'
import {
  ApplicationEvent,
  isPayloadSourceRetrieved,
  isPayloadSourceInternalChange,
  ContentType,
  SNComponent,
  SNNote,
  ComponentArea,
  PrefKey,
  ComponentViewer,
  ProposedSecondsToDeferUILevelSessionExpirationDuringActiveInteraction,
  NoteViewController,
  PayloadEmitSource,
} from '@standardnotes/snjs'
import { debounce, isDesktopApplication } from '@/Utils'
import { KeyboardModifier, KeyboardKey } from '@/Services/IOService'
import { EventSource } from '@/UIModels/AppState'
import { STRING_DELETE_PLACEHOLDER_ATTEMPT, STRING_DELETE_LOCKED_ATTEMPT, StringDeleteNote } from '@/Strings'
import { confirmDialog } from '@/Services/AlertService'
import { PureComponent } from '@/Components/Abstract/PureComponent'
import { ProtectedNoteOverlay } from '@/Components/ProtectedNoteOverlay/ProtectedNoteOverlay'
import { PinNoteButton } from '@/Components/PinNoteButton/PinNoteButton'
import { NotesOptionsPanel } from '@/Components/NotesOptions/NotesOptionsPanel'
import { NoteTagsContainer } from '@/Components/NoteTags/NoteTagsContainer'
import { ComponentView } from '@/Components/ComponentView/ComponentView'
import { PanelSide, PanelResizer, PanelResizeType } from '@/Components/PanelResizer/PanelResizer'
import { ElementIds } from '@/ElementIDs'
import { ChangeEditorButton } from '@/Components/ChangeEditor/ChangeEditorButton'
import { AttachedFilesButton } from '@/Components/AttachedFilesPopover/AttachedFilesButton'
import { EditingDisabledBanner } from './EditingDisabledBanner'
import {
  transactionForAssociateComponentWithCurrentNote,
  transactionForDisassociateComponentWithCurrentNote,
} from './TransactionFunctions'
import { reloadFont } from './FontFunctions'

const MINIMUM_STATUS_DURATION = 400
const TEXTAREA_DEBOUNCE = 100
const NOTE_EDITING_DISABLED_TEXT = 'Note editing disabled.'

type NoteStatus = {
  message?: string
  desc?: string
}

function sortAlphabetically(array: SNComponent[]): SNComponent[] {
  return array.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1))
}

type State = {
  availableStackComponents: SNComponent[]
  editorComponentViewer?: ComponentViewer
  editorComponentViewerDidAlreadyReload?: boolean
  editorStateDidLoad: boolean
  editorTitle: string
  editorText: string
  isDesktop?: boolean
  lockText: string
  marginResizersEnabled?: boolean
  monospaceFont?: boolean
  noteLocked: boolean
  noteStatus?: NoteStatus
  saveError?: boolean
  showLockedIcon: boolean
  showProtectedWarning: boolean
  spellcheck: boolean
  stackComponentViewers: ComponentViewer[]
  syncTakingTooLong: boolean
  /** Setting to true then false will allow the main content textarea to be destroyed
   * then re-initialized. Used when reloading spellcheck status. */
  textareaUnloading: boolean

  leftResizerWidth: number
  leftResizerOffset: number
  rightResizerWidth: number
  rightResizerOffset: number
}

interface Props {
  application: WebApplication
  controller: NoteViewController
}

export class NoteView extends PureComponent<Props, State> {
  readonly controller!: NoteViewController

  private statusTimeout?: NodeJS.Timeout
  private lastEditorFocusEventSource?: EventSource
  onEditorComponentLoad?: () => void

  private scrollPosition = 0
  private removeTrashKeyObserver?: () => void
  private removeTabObserver?: () => void
  private removeComponentStreamObserver?: () => void
  private removeComponentManagerObserver?: () => void
  private removeInnerNoteObserver?: () => void

  private protectionTimeoutId: ReturnType<typeof setTimeout> | null = null

  private editorContentRef: RefObject<HTMLDivElement>

  constructor(props: Props) {
    super(props, props.application)

    this.controller = props.controller

    this.onEditorComponentLoad = () => {
      this.application.getDesktopService()?.redoSearch()
    }

    this.debounceReloadEditorComponent = debounce(this.debounceReloadEditorComponent.bind(this), 25)

    this.textAreaChangeDebounceSave = debounce(this.textAreaChangeDebounceSave, TEXTAREA_DEBOUNCE)

    this.state = {
      availableStackComponents: [],
      editorStateDidLoad: false,
      editorText: '',
      editorTitle: '',
      isDesktop: isDesktopApplication(),
      lockText: NOTE_EDITING_DISABLED_TEXT,
      noteStatus: undefined,
      noteLocked: this.controller.note.locked,
      showLockedIcon: true,
      showProtectedWarning: false,
      spellcheck: true,
      stackComponentViewers: [],
      syncTakingTooLong: false,
      textareaUnloading: false,
      leftResizerWidth: 0,
      leftResizerOffset: 0,
      rightResizerWidth: 0,
      rightResizerOffset: 0,
    }

    this.editorContentRef = createRef<HTMLDivElement>()
  }

  override deinit() {
    this.removeComponentStreamObserver?.()
    ;(this.removeComponentStreamObserver as unknown) = undefined

    this.removeInnerNoteObserver?.()
    ;(this.removeInnerNoteObserver as unknown) = undefined

    this.removeComponentManagerObserver?.()
    ;(this.removeComponentManagerObserver as unknown) = undefined

    this.removeTrashKeyObserver?.()
    this.removeTrashKeyObserver = undefined

    this.clearNoteProtectionInactivityTimer()
    ;(this.ensureNoteIsInsertedBeforeUIAction as unknown) = undefined
    ;(this.controller as unknown) = undefined

    this.removeTabObserver?.()
    this.removeTabObserver = undefined
    this.onEditorComponentLoad = undefined

    this.statusTimeout = undefined
    ;(this.onPanelResizeFinish as unknown) = undefined
    super.deinit()
    ;(this.dismissProtectedWarning as unknown) = undefined
    ;(this.editorComponentViewerRequestsReload as unknown) = undefined
    ;(this.onTextAreaChange as unknown) = undefined
    ;(this.onTitleEnter as unknown) = undefined
    ;(this.onTitleChange as unknown) = undefined
    ;(this.onContentFocus as unknown) = undefined
    ;(this.onPanelResizeFinish as unknown) = undefined
    ;(this.stackComponentExpanded as unknown) = undefined
    ;(this.toggleStackComponent as unknown) = undefined
    ;(this.setScrollPosition as unknown) = undefined
    ;(this.resetScrollPosition as unknown) = undefined
    ;(this.onSystemEditorLoad as unknown) = undefined
    ;(this.debounceReloadEditorComponent as unknown) = undefined
    ;(this.textAreaChangeDebounceSave as unknown) = undefined
    ;(this.editorContentRef as unknown) = undefined
  }

  getState() {
    return this.state as State
  }

  get note() {
    return this.controller.note
  }

  override componentDidMount(): void {
    super.componentDidMount()

    this.registerKeyboardShortcuts()

    this.removeInnerNoteObserver = this.controller.addNoteInnerValueChangeObserver((note, source) => {
      this.onNoteInnerChange(note, source)
    })

    this.autorun(() => {
      this.setState({
        showProtectedWarning: this.appState.notes.showProtectedWarning,
      })
    })

    this.reloadEditorComponent().catch(console.error)
    this.reloadStackComponents().catch(console.error)

    const showProtectedWarning = this.note.protected && !this.application.hasProtectionSources()
    this.setShowProtectedOverlay(showProtectedWarning)

    this.reloadPreferences().catch(console.error)

    if (this.controller.isTemplateNote) {
      setTimeout(() => {
        this.focusTitle()
      })
    }
  }

  override componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (
      this.state.showProtectedWarning != undefined &&
      prevState.showProtectedWarning !== this.state.showProtectedWarning
    ) {
      this.reloadEditorComponent().catch(console.error)
    }
  }

  private onNoteInnerChange(note: SNNote, source: PayloadEmitSource): void {
    if (note.uuid !== this.note.uuid) {
      throw Error('Editor received changes for non-current note')
    }

    let title = this.state.editorTitle,
      text = this.state.editorText

    if (isPayloadSourceRetrieved(source)) {
      title = note.title
      text = note.text
    }

    if (!this.state.editorTitle) {
      title = note.title
    }

    if (!this.state.editorText) {
      text = note.text
    }

    if (title !== this.state.editorTitle) {
      this.setState({
        editorTitle: title,
      })
    }

    if (text !== this.state.editorText) {
      this.setState({
        editorText: text,
      })
    }

    if (note.locked !== this.state.noteLocked) {
      this.setState({
        noteLocked: note.locked,
      })
    }

    this.reloadSpellcheck().catch(console.error)

    const isTemplateNoteInsertedToBeInteractableWithEditor = source === PayloadEmitSource.LocalInserted && note.dirty
    if (isTemplateNoteInsertedToBeInteractableWithEditor) {
      return
    }

    if (note.lastSyncBegan || note.dirty) {
      if (note.lastSyncEnd) {
        const shouldShowSavingStatus = note.lastSyncBegan && note.lastSyncBegan.getTime() > note.lastSyncEnd.getTime()
        const shouldShowSavedStatus = note.lastSyncBegan && note.lastSyncEnd.getTime() > note.lastSyncBegan.getTime()
        if (note.dirty || shouldShowSavingStatus) {
          this.showSavingStatus()
        } else if (this.state.noteStatus && shouldShowSavedStatus) {
          this.showAllChangesSavedStatus()
        }
      } else {
        this.showSavingStatus()
      }
    }
  }

  override componentWillUnmount(): void {
    if (this.state.editorComponentViewer) {
      this.application.componentManager?.destroyComponentViewer(this.state.editorComponentViewer)
    }

    super.componentWillUnmount()
  }

  override async onAppLaunch() {
    await super.onAppLaunch()
    this.streamItems()
  }

  override async onAppEvent(eventName: ApplicationEvent) {
    switch (eventName) {
      case ApplicationEvent.PreferencesChanged:
        this.reloadPreferences().catch(console.error)
        break
      case ApplicationEvent.HighLatencySync:
        this.setState({ syncTakingTooLong: true })
        break
      case ApplicationEvent.CompletedFullSync: {
        this.setState({ syncTakingTooLong: false })
        const isInErrorState = this.state.saveError
        /** if we're still dirty, don't change status, a sync is likely upcoming. */
        if (!this.note.dirty && isInErrorState) {
          this.showAllChangesSavedStatus()
        }
        break
      }
      case ApplicationEvent.FailedSync:
        /**
         * Only show error status in editor if the note is dirty.
         * Otherwise, it means the originating sync came from somewhere else
         * and we don't want to display an error here.
         */
        if (this.note.dirty) {
          this.showErrorStatus()
        }
        break
      case ApplicationEvent.LocalDatabaseWriteError:
        this.showErrorStatus({
          message: 'Offline Saving Issue',
          desc: 'Changes not saved',
        })
        break
      case ApplicationEvent.UnprotectedSessionBegan: {
        this.setShowProtectedOverlay(false)
        break
      }
      case ApplicationEvent.UnprotectedSessionExpired: {
        if (this.note.protected) {
          this.hideProtectedNoteIfInactive()
        }
        break
      }
    }
  }

  getSecondsElapsedSinceLastEdit(): number {
    return (Date.now() - this.note.userModifiedDate.getTime()) / 1000
  }

  hideProtectedNoteIfInactive(): void {
    const secondsElapsedSinceLastEdit = this.getSecondsElapsedSinceLastEdit()
    if (secondsElapsedSinceLastEdit >= ProposedSecondsToDeferUILevelSessionExpirationDuringActiveInteraction) {
      this.setShowProtectedOverlay(true)
    } else {
      const secondsUntilTheNextCheck =
        ProposedSecondsToDeferUILevelSessionExpirationDuringActiveInteraction - secondsElapsedSinceLastEdit
      this.startNoteProtectionInactivityTimer(secondsUntilTheNextCheck)
    }
  }

  startNoteProtectionInactivityTimer(timerDurationInSeconds: number): void {
    this.clearNoteProtectionInactivityTimer()
    this.protectionTimeoutId = setTimeout(() => {
      this.hideProtectedNoteIfInactive()
    }, timerDurationInSeconds * 1000)
  }

  clearNoteProtectionInactivityTimer(): void {
    if (this.protectionTimeoutId) {
      clearTimeout(this.protectionTimeoutId)
    }
  }

  dismissProtectedWarning = async () => {
    let showNoteContents = true

    if (this.application.hasProtectionSources()) {
      showNoteContents = await this.application.authorizeNoteAccess(this.note)
    }

    if (!showNoteContents) {
      return
    }

    this.setShowProtectedOverlay(false)
    this.focusTitle()
  }

  streamItems() {
    this.removeComponentStreamObserver = this.application.streamItems(ContentType.Component, async ({ source }) => {
      if (isPayloadSourceInternalChange(source) || source === PayloadEmitSource.InitialObserverRegistrationPush) {
        return
      }
      if (!this.note) {
        return
      }
      await this.reloadStackComponents()
      this.debounceReloadEditorComponent()
    })
  }

  private createComponentViewer(component: SNComponent) {
    const viewer = this.application.componentManager.createComponentViewer(component, this.note.uuid)
    return viewer
  }

  public editorComponentViewerRequestsReload = async (viewer: ComponentViewer, force?: boolean): Promise<void> => {
    if (this.state.editorComponentViewerDidAlreadyReload && !force) {
      return
    }
    const component = viewer.component
    this.application.componentManager.destroyComponentViewer(viewer)
    this.setState(
      {
        editorComponentViewer: undefined,
        editorComponentViewerDidAlreadyReload: true,
      },
      () => {
        this.setState({
          editorComponentViewer: this.createComponentViewer(component),
          editorStateDidLoad: true,
        })
      },
    )
  }

  /**
   * Calling reloadEditorComponent successively without waiting for state to settle
   * can result in componentViewers being dealloced twice
   */
  debounceReloadEditorComponent() {
    this.reloadEditorComponent().catch(console.error)
  }

  private destroyCurrentEditorComponent() {
    const currentComponentViewer = this.state.editorComponentViewer
    if (currentComponentViewer) {
      this.application.componentManager.destroyComponentViewer(currentComponentViewer)
      this.setState({
        editorComponentViewer: undefined,
      })
    }
  }

  private async reloadEditorComponent() {
    if (this.state.showProtectedWarning) {
      this.destroyCurrentEditorComponent()
      return
    }

    const newEditor = this.application.componentManager.editorForNote(this.note)
    /** Editors cannot interact with template notes so the note must be inserted */
    if (newEditor && this.controller.isTemplateNote) {
      await this.controller.insertTemplatedNote()
      this.associateComponentWithCurrentNote(newEditor).catch(console.error)
    }
    const currentComponentViewer = this.state.editorComponentViewer

    if (currentComponentViewer?.componentUuid !== newEditor?.uuid) {
      if (currentComponentViewer) {
        this.destroyCurrentEditorComponent()
      }

      if (newEditor) {
        this.setState({
          editorComponentViewer: this.createComponentViewer(newEditor),
          editorStateDidLoad: true,
        })
      }
      reloadFont(this.state.monospaceFont)
    } else {
      this.setState({
        editorStateDidLoad: true,
      })
    }
  }

  hasAvailableExtensions() {
    return this.application.actionsManager.extensionsInContextOfItem(this.note).length > 0
  }

  showSavingStatus() {
    this.setStatus({ message: 'Saving…' }, false)
  }

  showAllChangesSavedStatus() {
    this.setState({
      saveError: false,
      syncTakingTooLong: false,
    })
    this.setStatus({
      message: 'All changes saved' + (this.application.noAccount() ? ' offline' : ''),
    })
  }

  showErrorStatus(error?: NoteStatus) {
    if (!error) {
      error = {
        message: 'Sync Unreachable',
        desc: 'Changes saved offline',
      }
    }
    this.setState({
      saveError: true,
      syncTakingTooLong: false,
    })
    this.setStatus(error)
  }

  setStatus(status: NoteStatus, wait = true) {
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout)
    }
    if (wait) {
      this.statusTimeout = setTimeout(() => {
        this.setState({
          noteStatus: status,
        })
      }, MINIMUM_STATUS_DURATION)
    } else {
      this.setState({
        noteStatus: status,
      })
    }
  }

  cancelPendingSetStatus() {
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout)
    }
  }

  onTextAreaChange = ({ currentTarget }: JSX.TargetedEvent<HTMLTextAreaElement, Event>) => {
    const text = currentTarget.value
    this.setState({
      editorText: text,
    })
    this.textAreaChangeDebounceSave()
  }

  textAreaChangeDebounceSave = () => {
    this.controller
      .save({
        editorValues: {
          title: this.state.editorTitle,
          text: this.state.editorText,
        },
        isUserModified: true,
      })
      .catch(console.error)
  }

  onTitleEnter = ({ currentTarget }: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    currentTarget.blur()
    this.focusEditor()
  }

  onTitleChange = ({ currentTarget }: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const title = currentTarget.value
    this.setState({
      editorTitle: title,
    })
    this.controller
      .save({
        editorValues: {
          title: title,
          text: this.state.editorText,
        },
        isUserModified: true,
        dontUpdatePreviews: true,
      })
      .catch(console.error)
  }

  focusEditor() {
    const element = document.getElementById(ElementIds.NoteTextEditor)
    if (element) {
      this.lastEditorFocusEventSource = EventSource.Script
      element.focus()
    }
  }

  focusTitle() {
    document.getElementById(ElementIds.NoteTitleEditor)?.focus()
  }

  onContentFocus = () => {
    if (this.lastEditorFocusEventSource) {
      this.application.getAppState().editorDidFocus(this.lastEditorFocusEventSource)
    }
    this.lastEditorFocusEventSource = undefined
  }

  setShowProtectedOverlay(show: boolean) {
    this.appState.notes.setShowProtectedWarning(show)
  }

  async deleteNote(permanently: boolean) {
    if (this.controller.isTemplateNote) {
      this.application.alertService.alert(STRING_DELETE_PLACEHOLDER_ATTEMPT).catch(console.error)
      return
    }
    if (this.note.locked) {
      this.application.alertService.alert(STRING_DELETE_LOCKED_ATTEMPT).catch(console.error)
      return
    }
    const title = this.note.title.length ? `'${this.note.title}'` : 'this note'
    const text = StringDeleteNote(title, permanently)
    if (
      await confirmDialog({
        text,
        confirmButtonStyle: 'danger',
      })
    ) {
      if (permanently) {
        this.performNoteDeletion(this.note)
      } else {
        this.controller
          .save({
            editorValues: {
              title: this.state.editorTitle,
              text: this.state.editorText,
            },
            bypassDebouncer: true,
            dontUpdatePreviews: true,
            customMutate: (mutator) => {
              mutator.trashed = true
            },
          })
          .catch(console.error)
      }
    }
  }

  performNoteDeletion(note: SNNote) {
    this.application.mutator.deleteItem(note).catch(console.error)
  }

  onPanelResizeFinish = async (width: number, left: number, isMaxWidth: boolean) => {
    if (isMaxWidth) {
      await this.application.setPreference(PrefKey.EditorWidth, null)
    } else {
      if (width !== undefined && width !== null) {
        await this.application.setPreference(PrefKey.EditorWidth, width)
      }
    }
    if (left !== undefined && left !== null) {
      await this.application.setPreference(PrefKey.EditorLeft, left)
    }
    this.application.sync.sync().catch(console.error)
  }

  async reloadSpellcheck() {
    const spellcheck = this.appState.notes.getSpellcheckStateForNote(this.note)

    if (spellcheck !== this.state.spellcheck) {
      this.setState({ textareaUnloading: true })
      this.setState({ textareaUnloading: false })
      reloadFont(this.state.monospaceFont)

      this.setState({
        spellcheck,
      })
    }
  }

  async reloadPreferences() {
    const monospaceFont = this.application.getPreference(PrefKey.EditorMonospaceEnabled, true)

    const marginResizersEnabled = this.application.getPreference(PrefKey.EditorResizersEnabled, true)

    await this.reloadSpellcheck()

    this.setState({
      monospaceFont,
      marginResizersEnabled,
    })

    reloadFont(monospaceFont)

    if (marginResizersEnabled) {
      const width = this.application.getPreference(PrefKey.EditorWidth, null)
      if (width != null) {
        this.setState({
          leftResizerWidth: width,
          rightResizerWidth: width,
        })
      }
      const left = this.application.getPreference(PrefKey.EditorLeft, null)
      if (left != null) {
        this.setState({
          leftResizerOffset: left,
          rightResizerOffset: left,
        })
      }
    }
  }

  /** @components */

  async reloadStackComponents() {
    const stackComponents = sortAlphabetically(
      this.application.componentManager
        .componentsForArea(ComponentArea.EditorStack)
        .filter((component) => component.active),
    )
    const enabledComponents = stackComponents.filter((component) => {
      return component.isExplicitlyEnabledForItem(this.note.uuid)
    })

    const needsNewViewer = enabledComponents.filter((component) => {
      const hasExistingViewer = this.state.stackComponentViewers.find(
        (viewer) => viewer.componentUuid === component.uuid,
      )
      return !hasExistingViewer
    })

    const needsDestroyViewer = this.state.stackComponentViewers.filter((viewer) => {
      const viewerComponentExistsInEnabledComponents = enabledComponents.find((component) => {
        return component.uuid === viewer.componentUuid
      })
      return !viewerComponentExistsInEnabledComponents
    })

    const newViewers: ComponentViewer[] = []
    for (const component of needsNewViewer) {
      newViewers.push(this.application.componentManager.createComponentViewer(component, this.note.uuid))
    }

    for (const viewer of needsDestroyViewer) {
      this.application.componentManager.destroyComponentViewer(viewer)
    }
    this.setState({
      availableStackComponents: stackComponents,
      stackComponentViewers: newViewers,
    })
  }

  stackComponentExpanded = (component: SNComponent): boolean => {
    return !!this.state.stackComponentViewers.find((viewer) => viewer.componentUuid === component.uuid)
  }

  toggleStackComponent = async (component: SNComponent) => {
    if (!component.isExplicitlyEnabledForItem(this.note.uuid)) {
      await this.associateComponentWithCurrentNote(component)
    } else {
      await this.disassociateComponentWithCurrentNote(component)
    }
    this.application.sync.sync().catch(console.error)
  }

  async disassociateComponentWithCurrentNote(component: SNComponent) {
    return this.application.mutator.runTransactionalMutation(
      transactionForDisassociateComponentWithCurrentNote(component, this.note),
    )
  }

  async associateComponentWithCurrentNote(component: SNComponent) {
    return this.application.mutator.runTransactionalMutation(
      transactionForAssociateComponentWithCurrentNote(component, this.note),
    )
  }

  registerKeyboardShortcuts() {
    this.removeTrashKeyObserver = this.application.io.addKeyObserver({
      key: KeyboardKey.Backspace,
      notTags: ['INPUT', 'TEXTAREA'],
      modifiers: [KeyboardModifier.Meta],
      onKeyDown: () => {
        this.deleteNote(false).catch(console.error)
      },
    })
  }

  setScrollPosition = () => {
    const editor = document.getElementById(ElementIds.NoteTextEditor) as HTMLInputElement
    this.scrollPosition = editor.scrollTop
  }

  resetScrollPosition = () => {
    const editor = document.getElementById(ElementIds.NoteTextEditor) as HTMLInputElement
    editor.scrollTop = this.scrollPosition
  }

  onSystemEditorLoad = (ref: HTMLTextAreaElement | null) => {
    if (this.removeTabObserver || !ref) {
      return
    }
    /**
     * Insert 4 spaces when a tab key is pressed,
     * only used when inside of the text editor.
     * If the shift key is pressed first, this event is
     * not fired.
     */
    const editor = document.getElementById(ElementIds.NoteTextEditor) as HTMLInputElement

    if (!editor) {
      console.error('Editor is not yet mounted; unable to add tab observer.')
      return
    }

    this.removeTabObserver = this.application.io.addKeyObserver({
      element: editor,
      key: KeyboardKey.Tab,
      onKeyDown: (event) => {
        if (document.hidden || this.note.locked || event.shiftKey) {
          return
        }
        event.preventDefault()
        /** Using document.execCommand gives us undo support */
        const insertSuccessful = document.execCommand('insertText', false, '\t')
        if (!insertSuccessful) {
          /** document.execCommand works great on Chrome/Safari but not Firefox */
          const start = editor.selectionStart || 0
          const end = editor.selectionEnd || 0
          const spaces = '    '
          /** Insert 4 spaces */
          editor.value = editor.value.substring(0, start) + spaces + editor.value.substring(end)
          /** Place cursor 4 spaces away from where the tab key was pressed */
          editor.selectionStart = editor.selectionEnd = start + 4
        }
        this.setState({
          editorText: editor.value,
        })

        this.controller
          .save({
            editorValues: {
              title: this.state.editorTitle,
              text: this.state.editorText,
            },
            bypassDebouncer: true,
          })
          .catch(console.error)
      },
    })

    editor.addEventListener('scroll', this.setScrollPosition)
    editor.addEventListener('input', this.resetScrollPosition)

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const removedNodes = record.removedNodes.values()
        for (const node of removedNodes) {
          if (node === editor) {
            this.removeTabObserver?.()
            this.removeTabObserver = undefined
            editor.removeEventListener('scroll', this.setScrollPosition)
            editor.removeEventListener('scroll', this.resetScrollPosition)
            this.scrollPosition = 0
          }
        }
      }
    })

    observer.observe(editor.parentElement as HTMLElement, { childList: true })
  }

  ensureNoteIsInsertedBeforeUIAction = async () => {
    if (this.controller.isTemplateNote) {
      await this.controller.insertTemplatedNote()
    }
  }

  override render() {
    if (this.state.showProtectedWarning) {
      return (
        <div aria-label="Note" className="section editor sn-component">
          {this.state.showProtectedWarning && (
            <div className="h-full flex justify-center items-center">
              <ProtectedNoteOverlay
                appState={this.appState}
                hasProtectionSources={this.application.hasProtectionSources()}
                onViewNote={this.dismissProtectedWarning}
              />
            </div>
          )}
        </div>
      )
    }

    return (
      <div aria-label="Note" className="section editor sn-component">
        <div className="flex-grow flex flex-col">
          {this.state.noteLocked && (
            <EditingDisabledBanner
              onMouseLeave={() => {
                this.setState({
                  lockText: NOTE_EDITING_DISABLED_TEXT,
                  showLockedIcon: true,
                })
              }}
              onMouseOver={() => {
                this.setState({
                  lockText: 'Enable editing',
                  showLockedIcon: false,
                })
              }}
              onClick={() => this.appState.notes.setLockSelectedNotes(!this.state.noteLocked)}
              showLockedIcon={this.state.showLockedIcon}
              lockText={this.state.lockText}
            />
          )}

          {this.note && (
            <div id="editor-title-bar" className="section-title-bar w-full">
              <div className="flex items-center justify-between h-8">
                <div className={(this.state.noteLocked ? 'locked' : '') + ' flex-grow'}>
                  <div className="title overflow-auto">
                    <input
                      className="input"
                      disabled={this.state.noteLocked}
                      id={ElementIds.NoteTitleEditor}
                      onChange={this.onTitleChange}
                      onFocus={(event) => {
                        ;(event.target as HTMLTextAreaElement).select()
                      }}
                      onKeyUp={(event) => event.keyCode == 13 && this.onTitleEnter(event)}
                      spellcheck={false}
                      value={this.state.editorTitle}
                      autocomplete="off"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <div id="save-status-container">
                    <div id="save-status">
                      <div
                        className={
                          (this.state.syncTakingTooLong ? 'warning sk-bold ' : '') +
                          (this.state.saveError ? 'danger sk-bold ' : '') +
                          ' message'
                        }
                      >
                        {this.state.noteStatus?.message}
                      </div>
                      {this.state.noteStatus?.desc && <div className="desc">{this.state.noteStatus.desc}</div>}
                    </div>
                  </div>
                  <div className="mr-3">
                    <AttachedFilesButton
                      application={this.application}
                      appState={this.appState}
                      onClickPreprocessing={this.ensureNoteIsInsertedBeforeUIAction}
                    />
                  </div>
                  <div className="mr-3">
                    <ChangeEditorButton
                      application={this.application}
                      appState={this.appState}
                      onClickPreprocessing={this.ensureNoteIsInsertedBeforeUIAction}
                    />
                  </div>
                  <div className="mr-3">
                    <PinNoteButton
                      appState={this.appState}
                      onClickPreprocessing={this.ensureNoteIsInsertedBeforeUIAction}
                    />
                  </div>
                  <NotesOptionsPanel
                    application={this.application}
                    appState={this.appState}
                    onClickPreprocessing={this.ensureNoteIsInsertedBeforeUIAction}
                  />
                </div>
              </div>
              <NoteTagsContainer appState={this.appState} />
            </div>
          )}

          <div id={ElementIds.EditorContent} className={ElementIds.EditorContent} ref={this.editorContentRef}>
            {this.state.marginResizersEnabled && this.editorContentRef.current ? (
              <PanelResizer
                minWidth={300}
                hoverable={true}
                collapsable={false}
                panel={this.editorContentRef.current}
                side={PanelSide.Left}
                type={PanelResizeType.OffsetAndWidth}
                left={this.state.leftResizerOffset}
                width={this.state.leftResizerWidth}
                resizeFinishCallback={this.onPanelResizeFinish}
              />
            ) : null}

            {this.state.editorComponentViewer && (
              <div className="component-view">
                <ComponentView
                  key={this.state.editorComponentViewer.identifier}
                  componentViewer={this.state.editorComponentViewer}
                  onLoad={this.onEditorComponentLoad}
                  requestReload={this.editorComponentViewerRequestsReload}
                  application={this.application}
                  appState={this.appState}
                />
              </div>
            )}

            {this.state.editorStateDidLoad && !this.state.editorComponentViewer && !this.state.textareaUnloading && (
              <textarea
                autocomplete="off"
                className="editable font-editor"
                dir="auto"
                id={ElementIds.NoteTextEditor}
                onChange={this.onTextAreaChange}
                value={this.state.editorText}
                readonly={this.state.noteLocked}
                onFocus={this.onContentFocus}
                spellcheck={this.state.spellcheck}
                ref={(ref) => ref && this.onSystemEditorLoad(ref)}
              ></textarea>
            )}

            {this.state.marginResizersEnabled && this.editorContentRef.current ? (
              <PanelResizer
                minWidth={300}
                hoverable={true}
                collapsable={false}
                panel={this.editorContentRef.current}
                side={PanelSide.Right}
                type={PanelResizeType.OffsetAndWidth}
                left={this.state.rightResizerOffset}
                width={this.state.rightResizerWidth}
                resizeFinishCallback={this.onPanelResizeFinish}
              />
            ) : null}
          </div>

          <div id="editor-pane-component-stack">
            {this.state.availableStackComponents.length > 0 && (
              <div id="component-stack-menu-bar" className="sk-app-bar no-edges">
                <div className="left">
                  {this.state.availableStackComponents.map((component) => {
                    return (
                      <div
                        key={component.uuid}
                        onClick={() => {
                          this.toggleStackComponent(component).catch(console.error)
                        }}
                        className="sk-app-bar-item"
                      >
                        <div className="sk-app-bar-item-column">
                          <div
                            className={
                              (this.stackComponentExpanded(component) && component.active ? 'info ' : '') +
                              (!this.stackComponentExpanded(component) ? 'neutral ' : '') +
                              ' sk-circle small'
                            }
                          />
                        </div>
                        <div className="sk-app-bar-item-column">
                          <div className="sk-label">{component.name}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="sn-component">
              {this.state.stackComponentViewers.map((viewer) => {
                return (
                  <div className="component-view component-stack-item">
                    <ComponentView
                      key={viewer.identifier}
                      componentViewer={viewer}
                      application={this.application}
                      appState={this.appState}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
