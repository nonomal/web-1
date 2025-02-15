import { ListableContentItem } from '@/Components/ContentListView/Types/ListableContentItem'
import { ChallengeReason, ContentType, KeyboardModifier, FileItem, SNNote, UuidString } from '@standardnotes/snjs'
import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import { WebApplication } from '../Application'
import { AbstractState } from './AbstractState'
import { AppState } from './AppState'

type SelectedItems = Record<UuidString, ListableContentItem>

export class SelectedItemsState extends AbstractState {
  lastSelectedItem: ListableContentItem | undefined
  selectedItems: SelectedItems = {}

  constructor(application: WebApplication, override appState: AppState, appObservers: (() => void)[]) {
    super(application)

    makeObservable(this, {
      selectedItems: observable,

      selectedItemsCount: computed,

      selectItem: action,
      setSelectedItems: action,
    })

    appObservers.push(
      application.streamItems<SNNote | FileItem>(
        [ContentType.Note, ContentType.File],
        ({ changed, inserted, removed }) => {
          runInAction(() => {
            for (const removedNote of removed) {
              delete this.selectedItems[removedNote.uuid]
            }

            for (const item of [...changed, ...inserted]) {
              if (this.selectedItems[item.uuid]) {
                this.selectedItems[item.uuid] = item
              }
            }
          })
        },
      ),
    )
  }

  private get io() {
    return this.application.io
  }

  get selectedItemsCount(): number {
    return Object.keys(this.selectedItems).length
  }

  getSelectedItems = <T extends ListableContentItem = ListableContentItem>(contentType?: ContentType): T[] => {
    return Object.values(this.selectedItems).filter((item) => {
      return !contentType ? true : item.content_type === contentType
    }) as T[]
  }

  setSelectedItems = (selectedItems: SelectedItems) => {
    this.selectedItems = selectedItems
  }

  public deselectItem = (item: { uuid: ListableContentItem['uuid'] }): void => {
    delete this.selectedItems[item.uuid]

    if (item.uuid === this.lastSelectedItem?.uuid) {
      this.lastSelectedItem = undefined
    }
  }

  public isItemSelected = (item: ListableContentItem): boolean => {
    return this.selectedItems[item.uuid] != undefined
  }

  public updateReferenceOfSelectedItem = (item: ListableContentItem): void => {
    this.selectedItems[item.uuid] = item
  }

  private selectItemsRange = async (selectedItem: ListableContentItem): Promise<void> => {
    const items = this.appState.contentListView.renderedItems

    const lastSelectedItemIndex = items.findIndex((item) => item.uuid == this.lastSelectedItem?.uuid)
    const selectedItemIndex = items.findIndex((item) => item.uuid == selectedItem.uuid)

    let itemsToSelect = []
    if (selectedItemIndex > lastSelectedItemIndex) {
      itemsToSelect = items.slice(lastSelectedItemIndex, selectedItemIndex + 1)
    } else {
      itemsToSelect = items.slice(selectedItemIndex, lastSelectedItemIndex + 1)
    }

    const authorizedItems = await this.application.protections.authorizeProtectedActionForItems(
      itemsToSelect,
      ChallengeReason.SelectProtectedNote,
    )

    for (const item of authorizedItems) {
      runInAction(() => {
        this.selectedItems[item.uuid] = item
        this.lastSelectedItem = item
      })
    }
  }

  cancelMultipleSelection = () => {
    this.io.cancelAllKeyboardModifiers()

    const firstSelectedItem = this.getSelectedItems()[0]

    if (firstSelectedItem) {
      this.replaceSelection(firstSelectedItem)
    } else {
      this.deselectAll()
    }
  }

  private replaceSelection = (item: ListableContentItem): void => {
    this.setSelectedItems({
      [item.uuid]: item,
    })

    this.lastSelectedItem = item
  }

  private deselectAll = (): void => {
    this.setSelectedItems({})

    this.lastSelectedItem = undefined
  }

  selectItem = async (
    uuid: UuidString,
    userTriggered?: boolean,
  ): Promise<{
    didSelect: boolean
  }> => {
    const item = this.application.items.findItem<ListableContentItem>(uuid)
    if (!item) {
      return {
        didSelect: false,
      }
    }

    const hasMeta = this.io.activeModifiers.has(KeyboardModifier.Meta)
    const hasCtrl = this.io.activeModifiers.has(KeyboardModifier.Ctrl)
    const hasShift = this.io.activeModifiers.has(KeyboardModifier.Shift)
    const hasMoreThanOneSelected = this.selectedItemsCount > 1
    const isAuthorizedForAccess = await this.application.protections.authorizeItemAccess(item)

    if (userTriggered && (hasMeta || hasCtrl)) {
      if (this.selectedItems[uuid] && hasMoreThanOneSelected) {
        delete this.selectedItems[uuid]
      } else if (isAuthorizedForAccess) {
        this.selectedItems[uuid] = item
        this.lastSelectedItem = item
      }
    } else if (userTriggered && hasShift) {
      await this.selectItemsRange(item)
    } else {
      const shouldSelectNote = hasMoreThanOneSelected || !this.selectedItems[uuid]
      if (shouldSelectNote && isAuthorizedForAccess) {
        this.replaceSelection(item)
      }
    }

    if (this.selectedItemsCount === 1) {
      const item = Object.values(this.selectedItems)[0]
      if (item.content_type === ContentType.Note) {
        await this.appState.notes.openNote(item.uuid)
      }
    }

    return {
      didSelect: this.selectedItems[uuid] != undefined,
    }
  }
}
