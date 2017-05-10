import { Viewport, IViewport, ViewportCallbacks } from './viewport'
import { Landmark as BBLandmark } from '../model/landmark'
import { App } from '../model/app'

const landmarkForBBLandmark = (bbLm: BBLandmark) => ({
    point: bbLm.point,
    isSelected: bbLm.isSelected(),
    index: bbLm.index
})

// A wrapper around the standalone viewport that hooks it into the legacy
// Backbone Landmarker.io code.

export class BackboneViewport {

    model: App
    viewport: IViewport

    constructor(element: HTMLElement, app: App) {
        this.model = app

        this.model.onBudgeLandmarks = (vector: [number, number]) => this.viewport.budgeLandmarks(vector)

        // Construct the callback object to be provided to the viewport
        const on: ViewportCallbacks = {
            selectLandmarks: is => is.forEach(i => this.model.landmarks.landmarks[i].select()),
            deselectLandmarks: is => is.forEach(i => this.model.landmarks.landmarks[i].deselect()),
            deselectAllLandmarks: () => {
                const lms = this.model.landmarks
                if (lms) {
                    lms.deselectAll()
                }
            },
            selectLandmarkAndDeselectRest: i => this.model.landmarks.landmarks[i].selectAndDeselectRest(),
            setLandmarkPoint: (i, point) => this.model.landmarks.setLmAt(this.model.landmarks.landmarks[i], point),
            setLandmarkPointWithoutHistory: (i, point) => this.model.landmarks.landmarks[i].point = point,
            addLandmarkHistory: delta => this.model.landmarks.tracker.record(delta),
            insertNewLandmark: point => this.model.landmarks.insertNew(point),
        }
        this.viewport = new Viewport(element, app.meshMode, on, true)
        window.vp = this.viewport

        this.model.on("newMeshAvailable", this.setMesh)
        this.model.on("change:landmarks", this.setLandmarks)
        this.model.on("change:landmarkSize", this.setLandmarkSize)
        this.model.on("change:connectivityOn", this.updateConnectivityDisplay)
        this.model.on("change:editingOn", this.updateEditingDisplay)
        this.model.on("change:boundingBoxOn", this.updateBoundingBoxDisplay)

        // make sure we didn't miss any state changes on load
        this.setMesh()
        this.setLandmarkSize()
        this.updateConnectivityDisplay()
        this.updateEditingDisplay()
        this.updateBoundingBoxDisplay()
    }

    setMesh = () => {
        const meshPayload = this.model.mesh
        if (meshPayload === null) {
            return
        }
        this.viewport.setMesh(meshPayload.mesh, meshPayload.up, meshPayload.front)
    }

    setLandmarks = () => {
        const landmarks = this.model.landmarks
        if (landmarks !== null) {
            this.viewport.setLandmarksAndConnectivity(landmarks.landmarks.map(landmarkForBBLandmark),
                                                      landmarks.connectivity)

            // TODO will this be collected properly?
            landmarks.landmarks.forEach((lm: BBLandmark) => lm.on('change', () => this.updateLandmark(lm.index)))
        }
    }

    setLandmarkSize = () => {
        this.viewport.setLandmarkSize(this.model.landmarkSize)
    }

    updateEditingDisplay = () => {
        this.viewport.snapModeEnabled = this.model.isEditingOn
    }

    updateConnectivityDisplay = () => {
        this.viewport.connectivityVisible = this.model.isConnectivityOn
    }

    updateBoundingBoxDisplay = () => {
        this.viewport.boundingBoxOn = this.model.isBoundingBoxOn
    }

    updateLandmark = (i: number) => {
        // console.log(`updating landmark ${i}`)
        this.viewport.updateLandmarks([
                landmarkForBBLandmark(this.model.landmarks.landmarks[i])
            ]
        )
    }

}
