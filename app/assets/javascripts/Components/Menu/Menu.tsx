import { JSX, FunctionComponent, ComponentChildren, VNode, RefCallback, ComponentChild, toChildArray } from 'preact'
import { useCallback, useEffect, useRef } from 'preact/hooks'
import { JSXInternal } from 'preact/src/jsx'
import { MenuItem, MenuItemListElement } from './MenuItem'
import { KeyboardKey } from '@/Services/IOService'
import { useListKeyboardNavigation } from '@/Hooks/useListKeyboardNavigation'

type MenuProps = {
  className?: string
  style?: string | JSX.CSSProperties | undefined
  a11yLabel: string
  children: ComponentChildren
  closeMenu?: () => void
  isOpen: boolean
  initialFocus?: number
}

export const Menu: FunctionComponent<MenuProps> = ({
  children,
  className = '',
  style,
  a11yLabel,
  closeMenu,
  isOpen,
  initialFocus,
}: MenuProps) => {
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const menuElementRef = useRef<HTMLMenuElement>(null)

  const handleKeyDown: JSXInternal.KeyboardEventHandler<HTMLMenuElement> = useCallback(
    (event) => {
      if (!menuItemRefs.current) {
        return
      }

      if (event.key === KeyboardKey.Escape) {
        closeMenu?.()
        return
      }
    },
    [closeMenu],
  )

  useListKeyboardNavigation(menuElementRef, initialFocus)

  useEffect(() => {
    if (isOpen && menuItemRefs.current.length > 0) {
      setTimeout(() => {
        menuElementRef.current?.focus()
      })
    }
  }, [isOpen])

  const pushRefToArray: RefCallback<HTMLLIElement> = useCallback((instance) => {
    if (instance && instance.children) {
      Array.from(instance.children).forEach((child) => {
        if (
          child.getAttribute('role')?.includes('menuitem') &&
          !menuItemRefs.current.includes(child as HTMLButtonElement)
        ) {
          menuItemRefs.current.push(child as HTMLButtonElement)
        }
      })
    }
  }, [])

  const mapMenuItems = useCallback(
    (child: ComponentChild, index: number, array: ComponentChild[]): ComponentChild => {
      if (!child || (Array.isArray(child) && child.length < 1)) {
        return
      }

      if (Array.isArray(child)) {
        return child.map(mapMenuItems)
      }

      const _child = child as VNode<unknown>
      const isFirstMenuItem = index === array.findIndex((child) => (child as VNode<unknown>).type === MenuItem)

      const hasMultipleItems = Array.isArray(_child.props.children)
        ? Array.from(_child.props.children as ComponentChild[]).some(
            (child) => (child as VNode<unknown>).type === MenuItem,
          )
        : false

      const items = hasMultipleItems ? [...(_child.props.children as ComponentChild[])] : [_child]

      return items.map((child) => {
        return (
          <MenuItemListElement isFirstMenuItem={isFirstMenuItem} ref={pushRefToArray}>
            {child}
          </MenuItemListElement>
        )
      })
    },
    [pushRefToArray],
  )

  return (
    <menu
      className={`m-0 p-0 list-style-none focus:shadow-none ${className}`}
      onKeyDown={handleKeyDown}
      ref={menuElementRef}
      style={style}
      aria-label={a11yLabel}
    >
      {toChildArray(children).map(mapMenuItems)}
    </menu>
  )
}
