import { ApplicationEvent } from '@standardnotes/snjs'
import { WebApplication } from '@/UIModels/Application'
import { AppState, AppStateEvent } from '@/UIModels/AppState'
import { autorun, IReactionDisposer, IReactionPublic } from 'mobx'
import { Component } from 'preact'
import { findDOMNode, unmountComponentAtNode } from 'preact/compat'

export type PureComponentState = Partial<Record<string, any>>
export type PureComponentProps = Partial<Record<string, any>>

export abstract class PureComponent<P = PureComponentProps, S = PureComponentState> extends Component<P, S> {
  private unsubApp!: () => void
  private unsubState!: () => void
  private reactionDisposers: IReactionDisposer[] = []

  constructor(props: P, protected application: WebApplication) {
    super(props)
  }

  override componentDidMount() {
    this.addAppEventObserver()
    this.addAppStateObserver()
  }

  deinit(): void {
    this.unsubApp?.()
    this.unsubState?.()
    for (const disposer of this.reactionDisposers) {
      disposer()
    }
    this.reactionDisposers.length = 0
    ;(this.unsubApp as unknown) = undefined
    ;(this.unsubState as unknown) = undefined
    ;(this.application as unknown) = undefined
    ;(this.props as unknown) = undefined
    ;(this.state as unknown) = undefined
  }

  protected dismissModal(): void {
    const elem = this.getElement()
    if (!elem) {
      return
    }

    const parent = elem.parentElement
    if (!parent) {
      return
    }
    parent.remove()
    unmountComponentAtNode(parent)
  }

  override componentWillUnmount(): void {
    this.deinit()
  }

  public get appState(): AppState {
    return this.application.getAppState()
  }

  protected getElement(): Element | null {
    return findDOMNode(this)
  }

  autorun(view: (r: IReactionPublic) => void): void {
    this.reactionDisposers.push(autorun(view))
  }

  addAppStateObserver() {
    this.unsubState = this.application.getAppState().addObserver(async (eventName, data) => {
      this.onAppStateEvent(eventName, data)
    })
  }

  onAppStateEvent(_eventName: AppStateEvent, _data: unknown) {
    /** Optional override */
  }

  addAppEventObserver() {
    if (this.application.isStarted()) {
      this.onAppStart().catch(console.error)
    }

    if (this.application.isLaunched()) {
      this.onAppLaunch().catch(console.error)
    }

    this.unsubApp = this.application.addEventObserver(async (eventName, data: unknown) => {
      if (!this.application) {
        return
      }

      this.onAppEvent(eventName, data)

      if (eventName === ApplicationEvent.Started) {
        await this.onAppStart()
      } else if (eventName === ApplicationEvent.Launched) {
        await this.onAppLaunch()
      } else if (eventName === ApplicationEvent.CompletedIncrementalSync) {
        this.onAppIncrementalSync()
      } else if (eventName === ApplicationEvent.CompletedFullSync) {
        this.onAppFullSync()
      } else if (eventName === ApplicationEvent.KeyStatusChanged) {
        this.onAppKeyChange().catch(console.error)
      } else if (eventName === ApplicationEvent.LocalDataLoaded) {
        this.onLocalDataLoaded()
      }
    })
  }

  onAppEvent(_eventName: ApplicationEvent, _data?: unknown) {
    /** Optional override */
  }

  async onAppStart() {
    /** Optional override */
  }

  onLocalDataLoaded() {
    /** Optional override */
  }

  async onAppLaunch() {
    /** Optional override */
  }

  async onAppKeyChange() {
    /** Optional override */
  }

  onAppIncrementalSync() {
    /** Optional override */
  }

  onAppFullSync() {
    /** Optional override */
  }
}
