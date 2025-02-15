import { STRING_NON_MATCHING_PASSWORDS } from '@/Strings'
import { WebApplication } from '@/UIModels/Application'
import { AppState } from '@/UIModels/AppState'
import { observer } from 'mobx-react-lite'
import { FunctionComponent } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { AccountMenuPane } from './AccountMenuPane'
import { Button } from '@/Components/Button/Button'
import { Checkbox } from '@/Components/Checkbox/Checkbox'
import { DecoratedPasswordInput } from '@/Components/Input/DecoratedPasswordInput'
import { Icon } from '@/Components/Icon/Icon'
import { IconButton } from '@/Components/Button/IconButton'

type Props = {
  appState: AppState
  application: WebApplication
  setMenuPane: (pane: AccountMenuPane) => void
  email: string
  password: string
}

export const ConfirmPassword: FunctionComponent<Props> = observer(
  ({ application, appState, setMenuPane, email, password }) => {
    const { notesAndTagsCount } = appState.accountMenu
    const [confirmPassword, setConfirmPassword] = useState('')
    const [isRegistering, setIsRegistering] = useState(false)
    const [isEphemeral, setIsEphemeral] = useState(false)
    const [shouldMergeLocal, setShouldMergeLocal] = useState(true)
    const [error, setError] = useState('')

    const passwordInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      passwordInputRef.current?.focus()
    }, [])

    const handlePasswordChange = useCallback((text: string) => {
      setConfirmPassword(text)
    }, [])

    const handleEphemeralChange = useCallback(() => {
      setIsEphemeral(!isEphemeral)
    }, [isEphemeral])

    const handleShouldMergeChange = useCallback(() => {
      setShouldMergeLocal(!shouldMergeLocal)
    }, [shouldMergeLocal])

    const handleConfirmFormSubmit = useCallback(
      (e: Event) => {
        e.preventDefault()

        if (!password) {
          passwordInputRef.current?.focus()
          return
        }

        if (password === confirmPassword) {
          setIsRegistering(true)
          application
            .register(email, password, isEphemeral, shouldMergeLocal)
            .then((res) => {
              if (res.error) {
                throw new Error(res.error.message)
              }
              appState.accountMenu.closeAccountMenu()
              appState.accountMenu.setCurrentPane(AccountMenuPane.GeneralMenu)
            })
            .catch((err) => {
              console.error(err)
              setError(err.message)
            })
            .finally(() => {
              setIsRegistering(false)
            })
        } else {
          setError(STRING_NON_MATCHING_PASSWORDS)
          setConfirmPassword('')
          passwordInputRef.current?.focus()
        }
      },
      [appState, application, confirmPassword, email, isEphemeral, password, shouldMergeLocal],
    )

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (error.length) {
          setError('')
        }
        if (e.key === 'Enter') {
          handleConfirmFormSubmit(e)
        }
      },
      [handleConfirmFormSubmit, error],
    )

    const handleGoBack = useCallback(() => {
      setMenuPane(AccountMenuPane.Register)
    }, [setMenuPane])

    return (
      <>
        <div className="flex items-center px-3 mt-1 mb-3">
          <IconButton
            icon="arrow-left"
            title="Go back"
            className="flex mr-2 color-neutral p-0"
            onClick={handleGoBack}
            focusable={true}
            disabled={isRegistering}
          />
          <div className="sn-account-menu-headline">Confirm password</div>
        </div>
        <div className="px-3 mb-3 text-sm">
          Because your notes are encrypted using your password,{' '}
          <span className="color-danger">Standard Notes does not have a password reset option</span>. If you forget your
          password, you will permanently lose access to your data.
        </div>
        <form onSubmit={handleConfirmFormSubmit} className="px-3 mb-1">
          <DecoratedPasswordInput
            className="mb-2"
            disabled={isRegistering}
            left={[<Icon type="password" className="color-neutral" />]}
            onChange={handlePasswordChange}
            onKeyDown={handleKeyDown}
            placeholder="Confirm password"
            ref={passwordInputRef}
            value={confirmPassword}
          />
          {error ? <div className="color-danger my-2">{error}</div> : null}
          <Button
            className="btn-w-full mt-1 mb-3"
            label={isRegistering ? 'Creating account...' : 'Create account & sign in'}
            variant="primary"
            onClick={handleConfirmFormSubmit}
            disabled={isRegistering}
          />
          <Checkbox
            name="is-ephemeral"
            label="Stay signed in"
            checked={!isEphemeral}
            onChange={handleEphemeralChange}
            disabled={isRegistering}
          />
          {notesAndTagsCount > 0 ? (
            <Checkbox
              name="should-merge-local"
              label={`Merge local data (${notesAndTagsCount} notes and tags)`}
              checked={shouldMergeLocal}
              onChange={handleShouldMergeChange}
              disabled={isRegistering}
            />
          ) : null}
        </form>
      </>
    )
  },
)
