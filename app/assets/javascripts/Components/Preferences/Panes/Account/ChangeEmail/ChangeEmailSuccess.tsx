import { FunctionalComponent } from 'preact'

export const ChangeEmailSuccess: FunctionalComponent = () => {
  return (
    <div>
      <div className={'sk-label sk-bold info mt-2'}>Your email has been successfully changed.</div>
      <p className={'sk-p'}>
        Please ensure you are running the latest version of Standard Notes on all platforms to ensure maximum
        compatibility.
      </p>
    </div>
  )
}
