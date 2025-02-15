import { WebApplication } from '@/UIModels/Application'
import { AppState } from '@/UIModels/AppState'
import { MENU_MARGIN_FROM_APP_BORDER } from '@/Constants'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@reach/disclosure'
import VisuallyHidden from '@reach/visually-hidden'
import { observer } from 'mobx-react-lite'
import { FunctionComponent } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { Icon } from '@/Components/Icon/Icon'
import { ChangeEditorMenu } from './ChangeEditorMenu'
import { useCloseOnBlur } from '@/Hooks/useCloseOnBlur'
import { isStateDealloced } from '@/UIModels/AppState/AbstractState'

type Props = {
  application: WebApplication
  appState: AppState
  onClickPreprocessing?: () => Promise<void>
}

export const ChangeEditorButton: FunctionComponent<Props> = observer(
  ({ application, appState, onClickPreprocessing }: Props) => {
    if (isStateDealloced(appState)) {
      return null
    }

    const note = appState.notes.firstSelectedNote
    const [isOpen, setIsOpen] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const [position, setPosition] = useState({
      top: 0,
      right: 0,
    })
    const [maxHeight, setMaxHeight] = useState<number | 'auto'>('auto')
    const buttonRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [closeOnBlur] = useCloseOnBlur(containerRef, setIsOpen)

    const toggleChangeEditorMenu = async () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        const { clientHeight } = document.documentElement
        const footerElementRect = document.getElementById('footer-bar')?.getBoundingClientRect()
        const footerHeightInPx = footerElementRect?.height

        if (footerHeightInPx) {
          setMaxHeight(clientHeight - rect.bottom - footerHeightInPx - MENU_MARGIN_FROM_APP_BORDER)
        }

        setPosition({
          top: rect.bottom,
          right: document.body.clientWidth - rect.right,
        })

        const newOpenState = !isOpen
        if (newOpenState && onClickPreprocessing) {
          await onClickPreprocessing()
        }

        setIsOpen(newOpenState)
        setTimeout(() => {
          setIsVisible(newOpenState)
        })
      }
    }

    return (
      <div ref={containerRef}>
        <Disclosure open={isOpen} onChange={toggleChangeEditorMenu}>
          <DisclosureButton
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false)
              }
            }}
            onBlur={closeOnBlur}
            ref={buttonRef}
            className="sn-icon-button border-contrast"
          >
            <VisuallyHidden>Change note type</VisuallyHidden>
            <Icon type="dashboard" className="block" />
          </DisclosureButton>
          <DisclosurePanel
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false)
                buttonRef.current?.focus()
              }
            }}
            ref={panelRef}
            style={{
              ...position,
              maxHeight,
            }}
            className="sn-dropdown sn-dropdown--animated min-w-68 max-h-120 max-w-xs flex flex-col overflow-y-auto fixed"
            onBlur={closeOnBlur}
          >
            {isOpen && (
              <ChangeEditorMenu
                closeOnBlur={closeOnBlur}
                application={application}
                isVisible={isVisible}
                note={note}
                closeMenu={() => {
                  setIsOpen(false)
                }}
              />
            )}
          </DisclosurePanel>
        </Disclosure>
      </div>
    )
  },
)
