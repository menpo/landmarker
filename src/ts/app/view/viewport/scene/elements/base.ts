export type ViewportElementCallbacks = {
    onCreate: (symbol: THREE.Object3D) => void
    onDispose: (symbol: THREE.Object3D) => void
}
