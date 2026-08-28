package com.rollerdash.arena.gl

import kotlin.math.cos
import kotlin.math.sin

/** Accumulates triangles into the layout [Mesh] expects. */
class MeshBuilder {
    private val verts = ArrayList<Float>(1024)
    private val idx = ArrayList<Short>(1024)

    fun vertex(x: Float, y: Float, z: Float, nx: Float, ny: Float, nz: Float, shade: Float): Int {
        val i = verts.size / Mesh.STRIDE
        verts.add(x); verts.add(y); verts.add(z)
        verts.add(nx); verts.add(ny); verts.add(nz)
        verts.add(shade)
        return i
    }

    fun tri(a: Int, b: Int, c: Int) {
        idx.add(a.toShort()); idx.add(b.toShort()); idx.add(c.toShort())
    }

    fun quad(a: Int, b: Int, c: Int, d: Int) {
        tri(a, b, c); tri(a, c, d)
    }

    fun build() = Mesh(verts.toFloatArray(), idx.toShortArray())

    companion object {
        /** Unit cube, half extent 0.5, so a scale of (w,h,d) gives exactly that size. */
        fun box(): Mesh {
            val b = MeshBuilder()
            val h = 0.5f
            // face: normal, four corners, baked shade (top brightest, underside dark)
            data class Face(val n: Triple<Float, Float, Float>, val shade: Float, val corners: Array<FloatArray>)
            val faces = listOf(
                Face(Triple(0f, 1f, 0f), 1.0f, arrayOf(
                    floatArrayOf(-h, h, -h), floatArrayOf(-h, h, h), floatArrayOf(h, h, h), floatArrayOf(h, h, -h))),
                Face(Triple(0f, -1f, 0f), 0.45f, arrayOf(
                    floatArrayOf(-h, -h, h), floatArrayOf(-h, -h, -h), floatArrayOf(h, -h, -h), floatArrayOf(h, -h, h))),
                Face(Triple(0f, 0f, 1f), 0.88f, arrayOf(
                    floatArrayOf(-h, -h, h), floatArrayOf(h, -h, h), floatArrayOf(h, h, h), floatArrayOf(-h, h, h))),
                Face(Triple(0f, 0f, -1f), 0.72f, arrayOf(
                    floatArrayOf(h, -h, -h), floatArrayOf(-h, -h, -h), floatArrayOf(-h, h, -h), floatArrayOf(h, h, -h))),
                Face(Triple(1f, 0f, 0f), 0.80f, arrayOf(
                    floatArrayOf(h, -h, h), floatArrayOf(h, -h, -h), floatArrayOf(h, h, -h), floatArrayOf(h, h, h))),
                Face(Triple(-1f, 0f, 0f), 0.80f, arrayOf(
                    floatArrayOf(-h, -h, -h), floatArrayOf(-h, -h, h), floatArrayOf(-h, h, h), floatArrayOf(-h, h, -h))),
            )
            for (f in faces) {
                val base = f.corners.map {
                    b.vertex(it[0], it[1], it[2], f.n.first, f.n.second, f.n.third, f.shade)
                }
                b.quad(base[0], base[1], base[2], base[3])
            }
            return b.build()
        }

        /** Unit cylinder along Y: radius 0.5, height 1, centred on the origin. */
        fun cylinder(sides: Int = 14): Mesh {
            val b = MeshBuilder()
            val r = 0.5f
            val h = 0.5f
            val ring = 2f * Math.PI.toFloat() / sides
            // Side wall.
            for (i in 0 until sides) {
                val a0 = i * ring
                val a1 = (i + 1) * ring
                val x0 = sin(a0) * r; val z0 = cos(a0) * r
                val x1 = sin(a1) * r; val z1 = cos(a1) * r
                val n0x = sin(a0); val n0z = cos(a0)
                val n1x = sin(a1); val n1z = cos(a1)
                val v0 = b.vertex(x0, -h, z0, n0x, 0f, n0z, 0.66f)
                val v1 = b.vertex(x1, -h, z1, n1x, 0f, n1z, 0.66f)
                val v2 = b.vertex(x1, h, z1, n1x, 0f, n1z, 0.95f)
                val v3 = b.vertex(x0, h, z0, n0x, 0f, n0z, 0.95f)
                b.quad(v0, v1, v2, v3)
            }
            // Caps.
            val topC = b.vertex(0f, h, 0f, 0f, 1f, 0f, 1f)
            val botC = b.vertex(0f, -h, 0f, 0f, -1f, 0f, 0.45f)
            for (i in 0 until sides) {
                val a0 = i * ring
                val a1 = (i + 1) * ring
                val t0 = b.vertex(sin(a0) * r, h, cos(a0) * r, 0f, 1f, 0f, 1f)
                val t1 = b.vertex(sin(a1) * r, h, cos(a1) * r, 0f, 1f, 0f, 1f)
                b.tri(topC, t0, t1)
                val u0 = b.vertex(sin(a0) * r, -h, cos(a0) * r, 0f, -1f, 0f, 0.45f)
                val u1 = b.vertex(sin(a1) * r, -h, cos(a1) * r, 0f, -1f, 0f, 0.45f)
                b.tri(botC, u1, u0)
            }
            return b.build()
        }

        /** Flat 1x1 quad on the XZ plane, facing up. */
        fun groundQuad(): Mesh {
            val b = MeshBuilder()
            val h = 0.5f
            val v0 = b.vertex(-h, 0f, -h, 0f, 1f, 0f, 1f)
            val v1 = b.vertex(-h, 0f, h, 0f, 1f, 0f, 1f)
            val v2 = b.vertex(h, 0f, h, 0f, 1f, 0f, 1f)
            val v3 = b.vertex(h, 0f, -h, 0f, 1f, 0f, 1f)
            b.quad(v0, v1, v2, v3)
            return b.build()
        }

        /**
         * Half-dome used for the sky. Rendered inside-out with depth writes off,
         * so the normals point inward.
         */
        fun skyDome(rings: Int = 8, sectors: Int = 16): Mesh {
            val b = MeshBuilder()
            val grid = Array(rings + 1) { IntArray(sectors + 1) }
            for (ry in 0..rings) {
                val phi = (ry.toFloat() / rings) * (Math.PI.toFloat() * 0.5f)
                val y = sin(phi)
                val r = cos(phi)
                for (sx in 0..sectors) {
                    val theta = (sx.toFloat() / sectors) * 2f * Math.PI.toFloat()
                    val x = sin(theta) * r
                    val z = cos(theta) * r
                    // Shade doubles as the horizon gradient for the sky shader.
                    grid[ry][sx] = b.vertex(x, y, z, -x, -y, -z, y)
                }
            }
            for (ry in 0 until rings) {
                for (sx in 0 until sectors) {
                    b.quad(grid[ry][sx], grid[ry][sx + 1], grid[ry + 1][sx + 1], grid[ry + 1][sx])
                }
            }
            return b.build()
        }
    }
}
