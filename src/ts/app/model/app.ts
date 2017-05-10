import * as $ from 'jquery'
import * as Backbone from 'backbone'
import Tracker from '../lib/tracker'
import * as AssetSource from './assetsource'
import * as Asset from './asset'
import { LandmarkGroup, LandmarkGroups, LandmarkGroupTracker, Landmark } from './landmark'
import Modal from '../view/modal'
import { Backend } from '../backend'
import { notify } from '../view/notification'

export type AppOptions = {
    mode: 'image' | 'mesh'
    backend: Backend
    _activeTemplate?: string
    _activeCollection?: string
    _assetIndex?: number
}

type LandmarkGroupTrackers = {
    [assetId: string]: {
        [template: string]: LandmarkGroupTracker
    }
}

function sortByPosition(lms: Landmark[]) {
    const compareByX = function(lm1: Landmark, lm2: Landmark) {
        if (lm1.point.x < lm2.point.x) {
            return -1
        } else if (lm1.point.x > lm2.point.x) {
            return 1
        }
        return 0
    }
    const lmsClone = lms.slice(0)
    lmsClone.sort(compareByX)
    var temp
    if (lmsClone[0].point.y > lmsClone[1].point.y) {
        temp = lmsClone[1]
        lmsClone[1] = lmsClone[0]
        lmsClone[0] = temp
    }
    if (lmsClone[2].point.y > lmsClone[3].point.y) {
        temp = lmsClone[3]
        lmsClone[3] = lmsClone[2]
        lmsClone[2] = temp
    }
    return lmsClone
}

function makesRectangleShape(lms: Landmark[]) {
    // Sort points by their position
    const sortedLms = sortByPosition(lms)
    // Allow for a little error in the rectangle
    const errorMarginX = (sortedLms[3].point.x - sortedLms[0].point.x) * 0.01
    const errorMarginY = (sortedLms[3].point.y - sortedLms[0].point.y) * 0.01
    return !(sortedLms[1].point.y < sortedLms[3].point.y - errorMarginY
    || sortedLms[1].point.y > sortedLms[3].point.y + errorMarginY
    || sortedLms[1].point.x < sortedLms[0].point.x - errorMarginX
    || sortedLms[1].point.x > sortedLms[0].point.x + errorMarginX
    || sortedLms[2].point.y < sortedLms[0].point.y - errorMarginY
    || sortedLms[2].point.y > sortedLms[0].point.y + errorMarginY
    || sortedLms[2].point.x < sortedLms[3].point.x - errorMarginX
    || sortedLms[2].point.x > sortedLms[3].point.x + errorMarginX)
}

export class App extends Backbone.Model {

    // We store a tracker per landmark group that we use in the app.
    // This is so we are able to undo/redo even after moving away from
    // and coming back to an asset.
    landmarkGroupTrackers: LandmarkGroupTrackers = {}
    onBudgeLandmarks: (vector: [number, number]) => void

    constructor(opts: AppOptions) {
        super({
            mode: 'mesh',
            boundingBoxOn: false,
            connectivityOn: true,
            editingOn: true,
            autoSaveOn: false,
            linksToggleEnabled: true,
            snapToggleEnabled: true,
            lmSizeSliderEnabled: true,
            activeTemplate: undefined,
            activeCollection: undefined,
            helpOverlayIsDisplayed: false
        })
        this.set(opts)
        this.landmarkSize = 0.2

        // New collection? Need to find the assets on them again
        this.listenTo(this, 'change:activeCollection', this.reloadAssetSource)
        this.listenTo(this, 'change:activeTemplate', () => {
            if (this.isBoundingBoxOn) {
                this.toggleBoundingBox()
            }
            this.reloadLandmarks()
        })

        this._initTemplates()
        this._initCollections()
    }

    get isBoundingBoxOn(): boolean {
        return this.get('boundingBoxOn')
    }

    get isConnectivityOn(): boolean {
        return this.get('connectivityOn')
    }

    get landmarks(): LandmarkGroup {
        return this.get('landmarks')
    }

    get landmarkGroups(): LandmarkGroups {
        return this.get('landmarkGroups')
    }

    set isBoundingBoxOn(isBoundingBoxOn: boolean) {
        this.set('boundingBoxOn', isBoundingBoxOn)
    }

    set isConnectivityOn(isConnectivityOn: boolean) {
        this.set('connectivityOn', isConnectivityOn)
    }

    get isAutoSaveOn(): boolean {
        return this.get('autoSaveOn')
    }

    set isAutoSaveOn(isAutoSaveOn: boolean) {
        this.set('autoSaveOn', isAutoSaveOn)
    }

    get linksToggleEnabled(): boolean {
        return this.get('linksToggleEnabled')
    }

    set linksToggleEnabled(linksToggleEnabled: boolean) {
        this.set('linksToggleEnabled', linksToggleEnabled)
    }

    get snapToggleEnabled(): boolean {
        return this.get('snapToggleEnabled')
    }

    set snapToggleEnabled(snapToggleEnabled: boolean) {
        this.set('snapToggleEnabled', snapToggleEnabled)
    }

    get lmSizeSliderEnabled(): boolean {
        return this.get('lmSizeSliderEnabled')
    }

    set lmSizeSliderEnabled(lmSizeSliderEnabled: boolean) {
        this.set('lmSizeSliderEnabled', lmSizeSliderEnabled)
    }

    get isEditingOn() {
        return this.get('editingOn')
    }

    set isEditingOn(isEditingOn: boolean) {
        this.set('editingOn', isEditingOn)
    }

    get isHelpOverlayOn(): boolean {
        return this.get('helpOverlayIsDisplayed')
    }

    set isHelpOverlayOn(isHelpOverlayOn: boolean) {
        this.set('helpOverlayIsDisplayed', isHelpOverlayOn)
    }

    toggleBoundingBox(): void {
        if (this.isBoundingBoxOn) {
            // Unlock these parameters before restoring them
            this.linksToggleEnabled = true
            this.snapToggleEnabled = true
            this.lmSizeSliderEnabled = true
            this.isConnectivityOn = this.get('_standbyIsConnectivityOn')
            this.isEditingOn = this.get('_standbyIsEditingOn')
            this.landmarkSize = this.get('_standbyLandmarkSize')
            this.isBoundingBoxOn = false
        } else {
            if (!this.imageMode) {
                // Should not be able to switch on bounding box annotation in mesh mode!
                return
            }
            // Do some checks
            const lms = this.landmarks.landmarks
            if (this.landmarks.labels.length !== 1 || lms.length !== 4) {
                notify({msg: `The current template does not match the format required for bounding box annotation.
                    The template must consist of one label and four landmarks.`, type: 'warning'})
                return
            }
            if (!((lms[0].isEmpty() && lms[1].isEmpty() && lms[2].isEmpty() && lms[3].isEmpty())
            || !(lms[0].isEmpty() || lms[1].isEmpty() || lms[2].isEmpty() || lms[3].isEmpty()))) {
                notify({msg: 'In order to switch on bounding box annotation, either 0 or 4 landmrks must be filled in.',
                type: 'warning'})
                return
            }
            if (!lms[0].isEmpty()) {
                if (!makesRectangleShape(lms)) {
                    notify({msg: 'These landmarks do not form a rectangle shape - bounding box annotation cannot be used.',
                    type: 'warning'})
                    return
                }
            }
            // Store these parameters, set them as needed and then lock them
            this.set('_standbyIsConnectivityOn', this.isConnectivityOn)
            this.set('_standbyIsEditingOn', this.isEditingOn)
            this.set('_standbyLandmarkSize', this.landmarkSize)
            this.isConnectivityOn = false
            this.isEditingOn = false
            // Scaling to zero causes problems with three.js
            this.landmarkSize = 0.00001
            this.linksToggleEnabled = false
            this.snapToggleEnabled = false
            this.lmSizeSliderEnabled = false
            this.isBoundingBoxOn = true
        }
    }

    toggleAutoSave(): void {
        this.isAutoSaveOn = !this.isAutoSaveOn
    }

    toggleConnectivity(): void {
        if (this.linksToggleEnabled) {
            this.isConnectivityOn = !this.isConnectivityOn
        }
    }

    toggleEditing(): void {
        if (this.snapToggleEnabled) {
            this.isEditingOn = !this.isEditingOn
            if (!this.isEditingOn && this.landmarks) {
                this.landmarks.deselectAll()
                this.landmarks.resetNextAvailable()
            }
        }
    }

    toggleHelpOverlay() {
        this.isHelpOverlayOn = !this.isHelpOverlayOn
    }

    get mode(): 'image' | 'mesh' {
        return this.get('mode')
    }

    get imageMode() {
        return this.get('mode') === 'image'
    }

    get meshMode() {
        return this.get('mode') === 'mesh'
    }

    get backend(): Backend {
        return this.get('backend')
    }

    get templates(): string[] {
        return this.get('templates')
    }

    get activeTemplate(): string {
        return this.get('activeTemplate')
    }

    collections(): string[] {
        return this.get('collections')
    }

    get activeCollection(): string {
        return this.get('activeCollection')
    }

    set activeCollection(activeCollection: string) {
        this.set('activeCollection', activeCollection)
    }

    get hasAssetSource() {
        return this.has('assetSource')
    }

    get assetSource(): AssetSource.ImageSource {
        return this.get('assetSource')
    }

    get assetIndex(): number {
        if (this.has('assetSource')) {
            return this.assetSource.assetIndex
        } else {
            return null
        }
    }

    // returns the currently active Asset (Image or Asset).
    // changes independently of mesh - care should be taken as to which one
    // other objects should listen to.
    get asset(): Asset.Image {
        return this.get('asset')
    }

    // returns the currently active THREE.Mesh.
    get mesh() {
        if (this.hasAssetSource) {
            return this.assetSource.mesh
        } else {
            return null
        }
    }

    get landmarkSize(): number {
        return this.get('landmarkSize')
    }

    set landmarkSize (landmarkSize: number) {
        if (this.lmSizeSliderEnabled) {
            this.set('landmarkSize', landmarkSize)
        }
    }

    budgeLandmarks(vector:  [number, number]) {
        if (this.onBudgeLandmarks !== null) {
            // call our onBudgeLandmarks callback
            this.onBudgeLandmarks(vector)
        }
    }

    get _activeTemplate(): string {
        return this.get('_activeTemplate')
    }

    set _activeTemplate(_activeTemplate: string) {
        this.set('_activeTemplate', _activeTemplate)
    }

    set templates(templates: string[]) {
        this.set('templates', templates)
    }

    _initTemplates(override=false) {
        // firstly, we need to find out what template we will use.
        // construct a template labels model to go grab the available labels.
        this.backend.fetchTemplates().then((templates) => {
            this.templates = templates
            let selected = templates[0]
            if (!override && this.has('_activeTemplate')) {
                // user has specified a preset! Use that if we can
                // TODO should validate here if we can actually use template
                const preset = this._activeTemplate
                if (templates.indexOf(preset) > -1) {
                    selected = preset
                }
            }
            this.set('activeTemplate', selected)
        }, () => {
            // TODO make this error more generic
            throw new Error('Failed to talk backend for templates (is ' +
                            'landmarkerio running from your command line?).')
        })
    }

    _initCollections(override=false) {
        this.backend.fetchCollections().then((collections) => {
            this.set('collections', collections)
            let selected = collections[0]
            if (!override && this.has('_activeCollection')) {
                const preset = this.get('_activeCollection')
                if (collections.indexOf(preset) > -1) {
                    selected = preset
                }
            }
            this.activeCollection = selected
        }, () => {
            throw new Error('Failed to talk backend for collections (is ' +
                            'landmarkerio running from your command line?).')
        })
    }

    reloadAssetSource() {
        // needs to have an activeCollection to preceed. AssetSource should be
        // updated every time the active collection is updated.
        if (!this.activeCollection) {
            // can only proceed with an activeCollection...
            console.log('App:reloadAssetSource with no activeCollection - doing nothing')
            return
        }

        console.log('App: reloading asset source')

        let oldIndex: number
        if (this.has('asset') && this.has('assetSource')) {
            const idx = this.assetSource.assetIndex
            if (idx > -1) {
                oldIndex = idx
            }
        }

        if (this.hasChanged('mode')) {
            $('#viewportContainer').trigger('resetCamera')
        }

        // Construct an asset source (which can query for asset information
        // from the backend). Of course, we must pass the backend in. The
        // asset source will ensure that the assets produced also get
        // attached to this backend.
        const ASC = this._assetSourceConstructor()
        const assetSource = new ASC(this.backend, this.activeCollection)
        if (this.has('assetSource')) {
            this.stopListening(this.get('assetSource'))
        }
        this.set('assetSource', assetSource)
        this.set('tracker', {})
        // whenever our asset source changes it's current asset and mesh we need
        // to update the app state.
        this.listenTo(assetSource, 'change:asset', this.assetChanged)
        this.listenTo(assetSource, 'change:mesh', this.meshChanged)

        assetSource.fetch().then(() => {
            let i: number

            console.log('assetSource retrieved - setting')

            if (oldIndex >= 0 && !this.hasChanged('activeCollection')) {
                i = oldIndex
            } else if (this.has('_assetIndex') && !this.has('asset')) {
                i = this.get('_assetIndex')
            } else {
                i = 0
            }

            if (i < 0 || i > assetSource.nAssets - 1) {
                throw Error(`Error trying to set index to ${i} - needs to be in the range 0-${assetSource.nAssets}`)
            }

            return this.goToAssetIndex(i)
        }, () => {
            throw new Error('Failed to fetch assets (is landmarkerio' +
                            'running from your command line?).')
        })
    }

    landmarkGroupTrackersForAsset(assetId: string): {[template: string]: LandmarkGroupTracker} {
        const trackers = this.landmarkGroupTrackers
        if (!trackers[assetId]) {
            trackers[assetId] = {}
        }

        return trackers[assetId]
     }

    reloadLandmarks() {
        if (this.landmarks && this.asset) {
            this.autoSaveWrapper(() => {
                this.set('landmarkGroups', null)
                this.set('landmarks', null)
                this.loadLandmarksPromise().then((lmGroups) => {
                    this.set('landmarkGroups', lmGroups)
                    this.set('landmarks', lmGroups.groups[this.activeTemplate])
                })
            })
        }
     }

    autoSaveWrapper(fn: () => void) {
        const lms = this.landmarks
        if (lms && !lms.tracker.isUpToDate) {
            if (!this.isAutoSaveOn) {
                Modal.confirm('You have unsaved changes, are you sure you want to proceed? (Your changes will be lost). Turn autosave on to save your changes by default.', fn)
            } else {
                lms.save().then(fn)
            }
        } else {
            fn()
        }
     }

    _assetSourceConstructor() {
        if (this.imageMode) {
            return AssetSource.ImageSource
        } else if (this.meshMode) {
            return AssetSource.MeshSource
        } else {
            throw Error('Error - illegal mode setting on app! Must be' +
                        ' mesh or image')
        }
     }

    // Mirror the state of the asset source onto the app
    assetChanged = () => {
        console.log('App.assetChanged')
        this.set('asset', this.assetSource.asset)
     }

    meshChanged() {
        console.log('App.meshChanged')
        this.trigger('newMeshAvailable')
     }

    loadLandmarksPromise() {
        return this.backend.fetchLandmarkGroups(
            this.asset.id
        ).then(json => {
            return new LandmarkGroups(
                json,
                this.asset.id,
                this.backend,
                this.landmarkGroupTrackersForAsset(this.asset.id)
            )
        }, () => {
            console.log('Error in fetching landmark JSON file')
        })
     }

    _promiseLandmarksWithAsset(loadAssetPromise) {
        // returns a promise that will only resolve when the asset and
        // landmarks are both downloaded and ready.

        // if both come true, then set the landmarks
        return Promise.all([this.loadLandmarksPromise(),
                            loadAssetPromise]).then((args) => {
            const landmarkGroups = args[0]
            console.log('landmarks are loaded and the asset is at a suitable ' +
                'state to display')
            // now we know that this is resolved we set the landmarks on the
            // app. This way we know the landmarks will always be set with a
            // valid asset.
            this.set('landmarkGroups', landmarkGroups)
            this.set('landmarks', landmarkGroups.groups[this.activeTemplate])
        })
     }

    _switchToAsset(newAssetPromise) {
        // The asset promise should come from the assetSource and will only
        // resolve when all the key data for annotating is loaded, the
        // promiseLandmark wraps it and only resolves when both landmarks (if
        // applicable) and asset data are present
        if (newAssetPromise) {
            this.set('landmarks', null)
            this.set('landmarkGroups', null)
            return this._promiseLandmarksWithAsset(newAssetPromise)
        }
     }

    nextAsset() {
        if (this.assetSource.hasSuccessor) {
            this.autoSaveWrapper(() => {
                this._switchToAsset(this.assetSource.next())
            })
        }
     }

    previousAsset() {
        if (this.assetSource.hasPredecessor) {
            this.autoSaveWrapper(() => {
                this._switchToAsset(this.assetSource.previous())
            })
        }
     }

    goToAssetIndex(newIndex: number) {
        this.autoSaveWrapper(() => {
            this._switchToAsset(this.assetSource.setIndex(newIndex))
        })
     }

    reloadLandmarksFromPrevious() {
        const lms = this.landmarks
        const template = this.activeTemplate
        if (lms) {
            const as = this.assetSource
            if (this.assetSource.hasPredecessor) {
                this.backend.fetchLandmarkGroups(
                    as.assets()[as.assetIndex - 1].id
                ).then((json) => {
                    lms.tracker.recordState(lms.toJSON())
                    lms.restore(json.groups[template])
                    lms.tracker.recordState(lms.toJSON(), false, true)
                }, () => {
                    console.log('Error in fetching landmark JSON file')
                })
            }
        }
     }

    incrementLandmarkSize() {
        const size = this.landmarkSize
        const factor = Math.floor(size / 0.25) + 1
        this.landmarkSize = Math.min(0.25 * factor, 1)
     }

    decrementLandmarkSize() {
        const size = this.landmarkSize
        const factor = Math.floor(size / 0.25) - 1
        this.landmarkSize = Math.max(0.25 * factor, 0.05)
    }

}
