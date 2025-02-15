import { destroyAllObjectProperties } from '@/Utils'
import {
  ApplicationEvent,
  ClientDisplayableError,
  convertTimestampToMilliseconds,
  DeinitSource,
} from '@standardnotes/snjs'
import { action, computed, makeObservable, observable } from 'mobx'
import { WebApplication } from '../Application'
import { AbstractState } from './AbstractState'

type Subscription = {
  planName: string
  cancelled: boolean
  endsAt: number
}

type AvailableSubscriptions = {
  [key: string]: {
    name: string
  }
}

export class SubscriptionState extends AbstractState {
  userSubscription: Subscription | undefined = undefined
  availableSubscriptions: AvailableSubscriptions | undefined = undefined

  override deinit(source: DeinitSource) {
    super.deinit(source)
    ;(this.userSubscription as unknown) = undefined
    ;(this.availableSubscriptions as unknown) = undefined

    destroyAllObjectProperties(this)
  }

  constructor(application: WebApplication, appObservers: (() => void)[]) {
    super(application)

    makeObservable(this, {
      userSubscription: observable,
      availableSubscriptions: observable,

      userSubscriptionName: computed,
      userSubscriptionExpirationDate: computed,
      isUserSubscriptionExpired: computed,
      isUserSubscriptionCanceled: computed,

      setUserSubscription: action,
      setAvailableSubscriptions: action,
    })

    appObservers.push(
      application.addEventObserver(async () => {
        if (application.hasAccount()) {
          this.getSubscriptionInfo().catch(console.error)
        }
      }, ApplicationEvent.Launched),
      application.addEventObserver(async () => {
        this.getSubscriptionInfo().catch(console.error)
      }, ApplicationEvent.SignedIn),
      application.addEventObserver(async () => {
        this.getSubscriptionInfo().catch(console.error)
      }, ApplicationEvent.UserRolesChanged),
    )
  }

  get userSubscriptionName(): string {
    if (
      this.availableSubscriptions &&
      this.userSubscription &&
      this.availableSubscriptions[this.userSubscription.planName]
    ) {
      return this.availableSubscriptions[this.userSubscription.planName].name
    }
    return ''
  }

  get userSubscriptionExpirationDate(): Date | undefined {
    if (!this.userSubscription) {
      return undefined
    }

    return new Date(convertTimestampToMilliseconds(this.userSubscription.endsAt))
  }

  get isUserSubscriptionExpired(): boolean {
    if (!this.userSubscriptionExpirationDate) {
      return false
    }

    return this.userSubscriptionExpirationDate.getTime() < new Date().getTime()
  }

  get isUserSubscriptionCanceled(): boolean {
    return Boolean(this.userSubscription?.cancelled)
  }

  public setUserSubscription(subscription: Subscription): void {
    this.userSubscription = subscription
  }

  public setAvailableSubscriptions(subscriptions: AvailableSubscriptions): void {
    this.availableSubscriptions = subscriptions
  }

  private async getAvailableSubscriptions() {
    try {
      const subscriptions = await this.application.getAvailableSubscriptions()
      if (!(subscriptions instanceof ClientDisplayableError)) {
        this.setAvailableSubscriptions(subscriptions)
      }
    } catch (error) {
      console.error(error)
    }
  }

  private async getSubscription() {
    try {
      const subscription = await this.application.getUserSubscription()
      if (!(subscription instanceof ClientDisplayableError)) {
        this.setUserSubscription(subscription)
      }
    } catch (error) {
      console.error(error)
    }
  }

  private async getSubscriptionInfo() {
    await this.getSubscription()
    await this.getAvailableSubscriptions()
  }
}
