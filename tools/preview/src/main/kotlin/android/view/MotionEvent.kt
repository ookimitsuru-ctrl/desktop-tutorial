@file:Suppress("unused")

package android.view

/**
 * Synthetic touch events. The preview builds these directly, which doubles as a
 * way to drive the on-screen controls from a script.
 */
class MotionEvent private constructor(
    val actionMasked: Int,
    val actionIndex: Int,
    private val ids: IntArray,
    private val xs: FloatArray,
    private val ys: FloatArray,
) {
    val pointerCount: Int get() = ids.size
    val x: Float get() = xs[0]
    val y: Float get() = ys[0]
    fun getPointerId(index: Int) = ids[index]
    fun getX(index: Int) = xs[index]
    fun getY(index: Int) = ys[index]
    fun getAxisValue(axis: Int) = 0f
    val source: Int get() = 0
    fun recycle() = Unit

    companion object {
        const val ACTION_DOWN = 0
        const val ACTION_UP = 1
        const val ACTION_MOVE = 2
        const val ACTION_CANCEL = 3
        const val ACTION_POINTER_DOWN = 5
        const val ACTION_POINTER_UP = 6
        const val AXIS_X = 0
        const val AXIS_Y = 1
        const val AXIS_Z = 11
        const val AXIS_RZ = 14
        const val AXIS_LTRIGGER = 17
        const val AXIS_RTRIGGER = 18

        @JvmStatic
        fun obtain(other: MotionEvent) = other

        @JvmStatic
        fun make(action: Int, actionIndex: Int, ids: IntArray, xs: FloatArray, ys: FloatArray) =
            MotionEvent(action, actionIndex, ids, xs, ys)
    }
}
