import React from 'react'
import styled from 'styled-components'
import createHistory from 'history/createHashHistory'
import { AragonApp } from '@aragon/ui'
import AppIFrame from './components/App/AppIFrame'
import App404 from './components/App404/App404'
import Home from './components/Home/Home'
import MenuPanel from './components/MenuPanel/MenuPanel'
import Permissions from './apps/Permissions/Permissions'
import Aragon, { IFrameMessenger, WorkerMessenger } from './aragon-mock'
import { getBlobUrl } from './worker-utils'
import { apps, notifications, tokens, prices, homeActions } from './demo-state'

class App extends React.Component {
  state = {
    appInstance: {},
    lastPath: '',
    path: '',
    search: '',
    sidePanelOpened: false,
    notifications,
  }
  constructor() {
    super()
    this.history = createHistory()
    this.history.listen(this.handleNavigation)

    const path = this.history.location.pathname
    const search = this.history.location.search || ''
    this.state.path = path
    this.state.search = search
    this.state.appInstance = this.appInstance(path, search)

    // Set up aragon-js mock
    this.aragon = new Aragon()
    this.workers = {}

    // Set up workers once we've loaded the installed apps
    this.aragon.getInstalledApps().then(this.launchAppWorkers)
  }
  componentDidMount() {
    this.aragon.addMessenger(
      'iframe',
      new IFrameMessenger(this.appIFrame.getIFrame())
    )
  }
  appInstance(path, search) {
    const matches = path.match(/^\/?(\w+)\/?(\w+)?/)
    if (!matches) {
      return { appId: 'home', instanceId: '' }
    }

    const params = search && search.split('?params=')[1]
    return {
      appId: matches[1],
      instanceId: matches[2],
      params: params ? JSON.parse(decodeURIComponent(params)) : null,
    }
  }
  changePath = (path, search = '') => {
    const { state } = this
    if (path !== state.path || search !== state.search) {
      this.history.push(path + search)
    }
  }
  getAppSrc(appId) {
    const app = apps.find(app => app.id === appId)
    return (app && app.src) || ''
  }
  handleIFrameMessage = event => {
    const { appId } = this.state.appInstance
    this.aragon.handleMessage(appId, event)
  }
  handleNavigateBack = () => {
    this.state.lastPath ? this.history.goBack() : this.history.replace('/')
  }
  handleNavigation = ({ pathname: path, search }) => {
    this.setState({
      path,
      search,
      appInstance: this.appInstance(path, search),
      lastPath: this.state.path,
    })
  }
  handleParamsRequest = params => {
    const { appId, instanceId } = this.state.appInstance
    this.openApp(
      appId,
      instanceId,
      params ? encodeURIComponent(JSON.stringify(params)) : null
    )
  }
  handleWorkerError = (appId, event) => {
    console.error(`${appId}'s worker encountered an error:`, event)
  }
  isAppInstalled(appId) {
    return (
      appId === 'home' ||
      appId === 'permissions' ||
      appId === 'settings' ||
      !!apps.find(app => app.id === appId)
    )
  }
  launchAppWorkers = installedApps => {
    installedApps.filter(app => app.script).forEach(async app => {
      let url = ''
      try {
        url = await getBlobUrl(app.script)
      } catch (e) {
        console.error(`Failed to load ${app.id}'s script (${app.script}): `, e)
        return
      }

      const worker = new Worker(url)
      worker.onmessage = (...args) => this.aragon.handleMessage(app.id, ...args)
      worker.onerror = (...args) => this.handleWorkerError(app.id, ...args)
      this.workers[app.id] = worker
      this.aragon.addMessenger(app.id, new WorkerMessenger(worker))

      // Clean up the url we created to spawn the worker
      URL.revokeObjectURL(url)
    })
  }
  openApp = (appId, instanceId, params) => {
    if (appId === 'home') {
      this.changePath('/')
      return
    }

    if (appId === 'settings') {
      this.changePath('/settings')
      return
    }

    // Get the first instance found if instanceId is not passed
    const app = apps.find(app => app.id === appId)

    const instances = (app && app.instances) || []
    const instance = instanceId
      ? instances.find(({ id }) => id === instanceId)
      : instances[0]

    this.changePath(
      `/${appId}${instance ? `/${instance.id}` : ''}`,
      params ? `?params=${params}` : ''
    )
  }
  openSidePanel = () => {
    this.setState({ sidePanelOpened: true })
  }
  closeSidePanel = () => {
    this.setState({ sidePanelOpened: false })
  }
  render() {
    const {
      appInstance: { appId, instanceId, params },
      notifications,
    } = this.state
    return (
      <AragonApp publicUrl="/aragon-ui/">
        <Main>
          <MenuPanel
            apps={apps}
            activeAppId={appId}
            activeInstanceId={instanceId}
            notifications={notifications}
            onOpenApp={this.openApp}
          />
          <AppScreen>
            {!this.isAppInstalled(appId) && (
              <App404 onNavigateBack={this.handleNavigateBack} />
            )}
            {appId === 'home' && (
              <Home
                tokens={tokens}
                prices={prices}
                actions={homeActions}
                onOpenApp={this.openApp}
              />
            )}
            {appId === 'permissions' && (
              <Permissions
                apps={apps}
                params={params}
                onParamsRequest={this.handleParamsRequest}
              />
            )}
            <AppIFrame
              onMessage={this.handleIFrameMessage}
              ref={appIFrame => (this.appIFrame = appIFrame)}
              src={this.getAppSrc(appId)}
            />
          </AppScreen>
        </Main>
      </AragonApp>
    )
  }
}

const Main = styled.div`
  display: flex;
  align-items: stretch;
  height: 100vh;
`

const AppScreen = styled.div`
  flex-grow: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
`

export default App
