import { FunctionComponent } from 'preact'
import { HorizontalSeparator } from '@/Components/Shared/HorizontalSeparator'

const HorizontalLine: FunctionComponent<{ index: number; length: number }> = ({ index, length }) => {
  return index < length - 1 ? <HorizontalSeparator classes="my-4" /> : null
}

export const PreferencesGroup: FunctionComponent = ({ children }) => (
  <div className="bg-default border-1 border-solid rounded border-main px-6 py-6 flex flex-col mb-3">
    {Array.isArray(children)
      ? children
          .filter((child) => child != undefined && child !== '' && child !== false)
          .map((child, i, arr) => (
            <>
              {child}
              <HorizontalLine index={i} length={arr.length} />
            </>
          ))
      : children}
  </div>
)
