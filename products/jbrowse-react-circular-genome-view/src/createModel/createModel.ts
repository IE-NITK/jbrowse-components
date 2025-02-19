import assemblyManagerFactory, {
  assemblyConfigSchemaFactory,
} from '@jbrowse/core/assemblyManager'
import { PluginConstructor } from '@jbrowse/core/Plugin'
import PluginManager from '@jbrowse/core/PluginManager'
import RpcManager from '@jbrowse/core/rpc/RpcManager'
import TextSearchManager from '@jbrowse/core/TextSearch/TextSearchManager'
import { UriLocation } from '@jbrowse/core/util'
import { cast, getSnapshot, Instance, SnapshotIn, types } from 'mobx-state-tree'
import corePlugins from '../corePlugins'
import createConfigModel from './createConfigModel'
import createSessionModel from './createSessionModel'

export default function createModel(runtimePlugins: PluginConstructor[]) {
  const pluginManager = new PluginManager(
    [...corePlugins, ...runtimePlugins].map(P => new P()),
  )
  pluginManager.createPluggableElements()
  const Session = createSessionModel(pluginManager)
  const assemblyConfigSchema = assemblyConfigSchemaFactory(pluginManager)
  const assemblyManagerType = assemblyManagerFactory(
    assemblyConfigSchema,
    pluginManager,
  )
  const rootModel = types
    .model('ReactCircularGenomeView', {
      config: createConfigModel(pluginManager, assemblyConfigSchema),
      session: Session,
      assemblyManager: assemblyManagerType,
      internetAccounts: types.array(
        pluginManager.pluggableMstType('internet account', 'stateModel'),
      ),
    })
    .volatile(() => ({
      error: undefined as Error | undefined,
    }))
    .actions(self => ({
      setSession(sessionSnapshot: SnapshotIn<typeof Session>) {
        self.session = cast(sessionSnapshot)
      },
      renameCurrentSession(sessionName: string) {
        if (self.session) {
          const snapshot = JSON.parse(JSON.stringify(getSnapshot(self.session)))
          snapshot.name = sessionName
          this.setSession(snapshot)
        }
      },
      setError(errorMessage: Error | undefined) {
        self.error = errorMessage
      },
      addInternetAccount(
        internetAccount: SnapshotIn<(typeof self.internetAccounts)[0]>,
      ) {
        self.internetAccounts.push(internetAccount)
      },
      findAppropriateInternetAccount(location: UriLocation) {
        // find the existing account selected from menu
        const selectedId = location.internetAccountId
        if (selectedId) {
          const selectedAccount = self.internetAccounts.find(account => {
            return account.internetAccountId === selectedId
          })
          if (selectedAccount) {
            return selectedAccount
          }
        }

        // if no existing account or not found, try to find working account
        for (const account of self.internetAccounts) {
          const handleResult = account.handlesLocation(location)
          if (handleResult) {
            return account
          }
        }

        // no available internet accounts
        return null
      },
    }))
    .views(self => ({
      get jbrowse() {
        return self.config
      },
      get pluginManager() {
        return pluginManager
      },
    }))
    .volatile(self => ({
      rpcManager: new RpcManager(pluginManager, self.config.configuration.rpc, {
        MainThreadRpcDriver: {},
      }),
      textSearchManager: new TextSearchManager(pluginManager),
    }))
  return { model: rootModel, pluginManager }
}

export type ViewStateModel = ReturnType<typeof createModel>['model']
export type ViewModel = Instance<ViewStateModel>
