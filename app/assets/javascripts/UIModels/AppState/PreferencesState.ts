import { PreferenceId } from '@/Components/Preferences/PreferencesMenu'
import { action, computed, makeObservable, observable } from 'mobx'

const DEFAULT_PANE = 'account'

export class PreferencesState {
  private _open = false
  currentPane: PreferenceId = DEFAULT_PANE

  constructor() {
    makeObservable<PreferencesState, '_open'>(this, {
      _open: observable,
      currentPane: observable,
      openPreferences: action,
      closePreferences: action,
      setCurrentPane: action,
      isOpen: computed,
    })
  }

  setCurrentPane = (prefId: PreferenceId): void => {
    this.currentPane = prefId
  }

  openPreferences = (): void => {
    this._open = true
  }

  closePreferences = (): void => {
    this._open = false
    this.currentPane = DEFAULT_PANE
  }

  get isOpen(): boolean {
    return this._open
  }
}
