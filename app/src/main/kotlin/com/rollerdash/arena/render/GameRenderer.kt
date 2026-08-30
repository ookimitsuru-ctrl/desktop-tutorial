package com.rollerdash.arena.render

import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import com.rollerdash.arena.AppState
import com.rollerdash.arena.Game
import com.rollerdash.arena.core.Mech
import com.rollerdash.arena.core.Obstacle
import com.rollerdash.arena.core.segmentT
import com.rollerdash.arena.core.Projectile
import com.rollerdash.arena.core.ProjectileKind
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.gl.MatrixStack
import com.rollerdash.arena.gl.Mesh
import com.rollerdash.arena.gl.MeshBuilder
import com.rollerdash.arena.gl.QuadBatch
import com.rollerdash.arena.gl.ShaderProgram
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

/**
 * Draws the whole game: dusk sky, the pit, both machines, ordnance, particles
 * and the HUD, in that order. Everything is generated at load time - there are
 * no textures or models on disk.
 */
class GameRenderer(private val game: Game) : GLSurfaceView.Renderer {

    private lateinit var solidProgram: ShaderProgram
    private lateinit var floorProgram: ShaderProgram
    private lateinit var skyProgram: ShaderProgram
    private lateinit var spriteProgram: ShaderProgram
    private lateinit var hudProgram: ShaderProgram

    private lateinit var boxMesh: Mesh
    private lateinit var cylMesh: Mesh
    private lateinit var groundMesh: Mesh
    private lateinit var skyMesh: Mesh

    private lateinit var mechModel: MechModel
    private lateinit var font: FontAtlas
    private lateinit var spriteBatch: QuadBatch
    private lateinit var hudBatch: QuadBatch
    private lateinit var painter: HudPainter

    val camera = Camera()
    private val stack = MatrixStack()
    private val mvp = FloatArray(16)
    private val ortho = FloatArray(16)
    private val modelScratch = FloatArray(16)

    private var lastFrameNs = 0L
    private var smoothedFps = 60f
    private var elapsed = 0f
    private var lastMesh: Mesh? = null
    private var frameCount = 0L
    /** Cover standing between the camera and the player, drawn see-through. */
    private val occluders = ArrayList<Obstacle>()

    private var viewWidth = 1
    private var viewHeight = 1

    // Dusk over the wastes: warm haze at the horizon, cold sky above.
    private val fog = floatArrayOf(0.55f, 0.49f, 0.41f)
    private val lightDir = normalize(floatArrayOf(0.45f, 0.72f, 0.30f))

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        solidProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.SOLID_FS, "solid")
        floorProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.FLOOR_FS, "floor")
        skyProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.SKY_FS, "sky")
        spriteProgram = ShaderProgram(Shaders.SPRITE_VS, Shaders.SPRITE_FS, "sprite")
        hudProgram = ShaderProgram(Shaders.HUD_VS, Shaders.HUD_FS, "hud")

        boxMesh = MeshBuilder.box()
        cylMesh = MeshBuilder.cylinder(16)
        groundMesh = MeshBuilder.groundQuad()
        skyMesh = MeshBuilder.skyDome(10, 20)

        mechModel = MechModel(boxMesh, cylMesh)
        font = FontAtlas()
        spriteBatch = QuadBatch(2600)
        hudBatch = QuadBatch(1400)
        painter = HudPainter(hudBatch, hudProgram, font)

        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glCullFace(GLES30.GL_BACK)
        GLES30.glClearColor(fog[0], fog[1], fog[2], 1f)
        lastFrameNs = System.nanoTime()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        viewWidth = width
        viewHeight = height
        GLES30.glViewport(0, 0, width, height)
        camera.resize(width, height)
        Matrix.orthoM(ortho, 0, 0f, width.toFloat(), height.toFloat(), 0f, -1f, 1f)
        game.layout(width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        val now = System.nanoTime()
        var dt = (now - lastFrameNs) / 1_000_000_000f
        lastFrameNs = now
        if (dt > 0.1f) dt = 0.1f
        if (dt <= 0f) dt = 1f / 60f
        elapsed += dt
        frameCount++
        smoothedFps = smoothedFps * 0.92f + (1f / dt) * 0.08f

        game.update(dt)

        val battle = game.battle
        for (i in battle.mechs.indices) {
            mechModel.update(game.renderStates[i], battle.mechs[i], dt)
        }
        if (game.state == AppState.BATTLE || game.state == AppState.PAUSED) {
            camera.updateBattle(dt, battle, game.cameraShake)
        } else {
            camera.updateOrbit(dt, battle)
        }

        drawScene()
        drawOverlay()
    }

    // ---- 3D ------------------------------------------------------------------

    private fun drawScene() {
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
        // Culling is for closed solids only. Quads - shadows, sprites, the whole
        // HUD - are built without a guaranteed winding, so they must not be culled.
        GLES30.glEnable(GLES30.GL_CULL_FACE)

        drawSky()
        drawFloor()
        drawWorldGeometry()
        drawMechs()
        drawOccluders()
        drawShadows()
        drawProjectiles()
        drawEffects()
    }

    private fun drawSky() {
        GLES30.glDepthMask(false)
        GLES30.glCullFace(GLES30.GL_FRONT)
        skyProgram.use()
        val p = camera.position
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.translateM(modelScratch, 0, p.x, p.y - 12f, p.z)
        Matrix.scaleM(modelScratch, 0, 300f, 190f, 300f)
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, modelScratch, 0)
        skyProgram.setMat4("uMVP", mvp)
        skyProgram.setMat4("uModel", modelScratch)
        skyProgram.setVec3("uHorizon", 0.72f, 0.55f, 0.38f)
        skyProgram.setVec3("uZenith", 0.16f, 0.22f, 0.34f)
        skyProgram.setVec3("uLightDir", lightDir[0], lightDir[1], lightDir[2])
        skyMesh.bind(skyProgram)
        skyMesh.draw()
        GLES30.glCullFace(GLES30.GL_BACK)
        GLES30.glDepthMask(true)
        lastMesh = null
    }

    private fun drawFloor() {
        val arena = game.arena
        floorProgram.use()
        floorProgram.setVec3("uLightDir", lightDir[0], lightDir[1], lightDir[2])
        floorProgram.setVec3("uCameraPos", camera.position.x, camera.position.y, camera.position.z)
        floorProgram.setVec3("uFogColor", fog[0], fog[1], fog[2])
        floorProgram.setFloat("uFogDensity", 0.0060f)
        floorProgram.setFloat("uHalfSize", arena.halfSize)
        floorProgram.setFloat("uTime", elapsed)
        floorProgram.setVec4("uColor", 0.36f, 0.38f, 0.30f, 1f)
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.scaleM(modelScratch, 0, arena.halfSize * 2.4f, 1f, arena.halfSize * 2.4f)
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, modelScratch, 0)
        floorProgram.setMat4("uMVP", mvp)
        floorProgram.setMat4("uModel", modelScratch)
        groundMesh.bind(floorProgram)
        groundMesh.draw()
        lastMesh = null
    }

    private fun beginSolid() {
        solidProgram.use()
        solidProgram.setVec3("uLightDir", lightDir[0], lightDir[1], lightDir[2])
        solidProgram.setVec3("uCameraPos", camera.position.x, camera.position.y, camera.position.z)
        solidProgram.setVec3("uFogColor", fog[0], fog[1], fog[2])
        solidProgram.setFloat("uFogDensity", 0.0060f)
        solidProgram.setFloat("uEmissive", 0f)
        solidProgram.setVec3("uFlash", 0f, 0f, 0f)
        lastMesh = null
    }

    private fun drawSolid(
        mesh: Mesh,
        model: FloatArray,
        color: Int,
        emissive: Float,
        flash: Float = 0f,
        alpha: Float = 1f,
    ) {
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, model, 0)
        solidProgram.setMat4("uMVP", mvp)
        solidProgram.setMat4("uModel", model)
        solidProgram.setVec4("uColor", red(color), green(color), blue(color), alpha)
        solidProgram.setFloat("uEmissive", emissive)
        solidProgram.setVec3("uFlash", flash * 0.9f, flash * 0.25f, flash * 0.2f)
        if (lastMesh !== mesh) {
            mesh.bind(solidProgram)
            lastMesh = mesh
        }
        mesh.draw()
    }

    private fun drawWorldGeometry() {
        val arena = game.arena
        beginSolid()
        val h = arena.halfSize
        val wallH = 16f
        val t = 3f
        // Four perimeter walls, so the pit reads as an enclosed arena.
        placeBox(0f, wallH * 0.5f, h + t * 0.5f, h * 2f + t * 2f, wallH, t)
        drawSolid(boxMesh, modelScratch, 0x4E5148, 0f)
        placeBox(0f, wallH * 0.5f, -h - t * 0.5f, h * 2f + t * 2f, wallH, t)
        drawSolid(boxMesh, modelScratch, 0x4E5148, 0f)
        placeBox(h + t * 0.5f, wallH * 0.5f, 0f, t, wallH, h * 2f)
        drawSolid(boxMesh, modelScratch, 0x565A50, 0f)
        placeBox(-h - t * 0.5f, wallH * 0.5f, 0f, t, wallH, h * 2f)
        drawSolid(boxMesh, modelScratch, 0x565A50, 0f)

        // Hazard stripe along the base of each wall.
        placeBox(0f, 0.6f, h - 0.2f, h * 2f, 1.2f, 0.4f)
        drawSolid(boxMesh, modelScratch, 0xB8862B, 0.2f)
        placeBox(0f, 0.6f, -h + 0.2f, h * 2f, 1.2f, 0.4f)
        drawSolid(boxMesh, modelScratch, 0xB8862B, 0.2f)

        // Anything between the camera and the pilot is held back for the
        // see-through pass, so cover can never hide your own machine.
        occluders.clear()
        val eye = camera.position
        val target = game.battle.player.center
        for (o in arena.obstacles) {
            if (o.segmentT(eye, target) != null) {
                occluders += o
                continue
            }
            when (o) {
                is Obstacle.Box -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.halfX * 2f, o.height, o.halfZ * 2f)
                    drawSolid(boxMesh, modelScratch, 0x6B6A5E, 0f)
                    // Capstone, to break up the silhouette.
                    placeBox(o.center.x, o.height + 0.18f, o.center.z, o.halfX * 2f + 0.5f, 0.36f, o.halfZ * 2f + 0.5f)
                    drawSolid(boxMesh, modelScratch, 0x878577, 0f)
                }
                is Obstacle.Cylinder -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.radius * 2f, o.height, o.radius * 2f)
                    drawSolid(cylMesh, modelScratch, 0x716F62, 0f)
                    placeBox(o.center.x, o.height + 0.2f, o.center.z, o.radius * 2.4f, 0.4f, o.radius * 2.4f)
                    drawSolid(cylMesh, modelScratch, 0x8E8B7C, 0f)
                }
            }
        }
    }

    /**
     * Cover in the way of the shot is drawn as a ghost: blended, writing no
     * depth, after the mechs, so the machine reads straight through it.
     */
    private fun drawOccluders() {
        if (occluders.isEmpty()) return
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        GLES30.glDepthMask(false)
        beginSolid()
        for (o in occluders) {
            when (o) {
                is Obstacle.Box -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.halfX * 2f, o.height, o.halfZ * 2f)
                    drawSolid(boxMesh, modelScratch, 0x8FA0A8, 0.25f, alpha = 0.30f)
                }
                is Obstacle.Cylinder -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.radius * 2f, o.height, o.radius * 2f)
                    drawSolid(cylMesh, modelScratch, 0x8FA0A8, 0.25f, alpha = 0.30f)
                }
            }
        }
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
    }

    private fun placeBox(x: Float, y: Float, z: Float, sx: Float, sy: Float, sz: Float) {
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.translateM(modelScratch, 0, x, y, z)
        Matrix.scaleM(modelScratch, 0, sx, sy, sz)
    }

    private fun drawMechs() {
        beginSolid()
        val battle = game.battle
        for ((i, mech) in battle.mechs.withIndex()) {
            // A destroyed machine still lies where it fell until the round resets.
            val blink = if (mech.invuln > 0f && ((elapsed * 14f).toInt() % 2 == 0)) 0.35f else 0f
            stack.identity()
            stack.translate(mech.pos.x, mech.pos.y, mech.pos.z)
            mechModel.draw(mech, game.renderStates[i], stack) { mesh, model, color, emissive ->
                drawSolid(mesh, model, color, maxOf(emissive * 0.6f, blink), mech.tookDamageFlash)
            }
        }
    }

    private fun drawShadows() {
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        GLES30.glDepthMask(false)
        spriteProgram.use()
        spriteProgram.setMat4("uViewProj", camera.viewProj)
        spriteProgram.setInt("uShape", 3)
        spriteBatch.begin()
        for (mech in game.battle.mechs) shadowQuad(mech)
        spriteBatch.flush(spriteProgram)
    }

    private fun shadowQuad(mech: Mech) {
        val ground = game.arena.groundHeightAt(mech.pos)
        val lift = clamp(mech.pos.y - ground, 0f, 18f)
        val size = mech.spec.radius * (3.4f - lift * 0.06f)
        val a = clamp(0.5f - lift * 0.025f, 0.05f, 0.5f)
        val y = ground + 0.06f
        val h = size * 0.5f
        val x = mech.pos.x
        val z = mech.pos.z
        spriteBatch.addQuad(
            x - h, y, z - h,
            x + h, y, z - h,
            x + h, y, z + h,
            x - h, y, z + h,
            0f, 0f, 1f, 1f,
            0.05f, 0.06f, 0.05f, a,
        )
    }

    private fun drawProjectiles() {
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE)
        spriteProgram.use()
        spriteProgram.setMat4("uViewProj", camera.viewProj)
        spriteProgram.setInt("uShape", 2)
        spriteBatch.begin()
        for (p in game.battle.projectiles) projectileQuad(p)
        spriteBatch.flush(spriteProgram)
    }

    private fun projectileQuad(p: Projectile) {
        val (r, g, b, size) = when (p.kind) {
            ProjectileKind.BULLET -> Quad(1f, 0.86f, 0.45f, 0.55f)
            ProjectileKind.PLASMA -> Quad(0.55f, 0.95f, 1f, 0.95f)
            ProjectileKind.MISSILE -> Quad(1f, 0.72f, 0.38f, 0.8f)
            ProjectileKind.MORTAR -> Quad(1f, 0.62f, 0.30f, 0.9f)
            ProjectileKind.NAPALM -> Quad(1f, 0.48f, 0.20f, 1.3f)
            ProjectileKind.MELEE -> return
        }
        // Stretch the sprite along the direction of travel, in screen space.
        val rx = camera.rightX(); val ry = camera.rightY(); val rz = camera.rightZ()
        val ux = camera.upX(); val uy = camera.upY(); val uz = camera.upZ()
        val ax = p.vel.x * rx + p.vel.y * ry + p.vel.z * rz
        val ay = p.vel.x * ux + p.vel.y * uy + p.vel.z * uz
        val len = sqrt(ax * ax + ay * ay)
        val half = size * 0.5f
        var axX = rx * half; var axY = ry * half; var axZ = rz * half
        var upXv = ux * half; var upYv = uy * half; var upZv = uz * half
        if (len > 0.001f) {
            val dx = ax / len
            val dy = ay / len
            val stretch = half * (1.4f + minOf(p.vel.length * 0.035f, 7f))
            axX = (rx * dx + ux * dy) * stretch
            axY = (ry * dx + uy * dy) * stretch
            axZ = (rz * dx + uz * dy) * stretch
            upXv = (rx * -dy + ux * dx) * half
            upYv = (ry * -dy + uy * dx) * half
            upZv = (rz * -dy + uz * dx) * half
        }
        val x = p.pos.x; val y = p.pos.y; val z = p.pos.z
        spriteBatch.addQuad(
            x - axX - upXv, y - axY - upYv, z - axZ - upZv,
            x + axX - upXv, y + axY - upYv, z + axZ - upZv,
            x + axX + upXv, y + axY + upYv, z + axZ + upZv,
            x - axX + upXv, y - axY + upYv, z - axZ + upZv,
            0f, 0f, 1f, 1f,
            r, g, b, 1f,
        )
        // Missiles and shells leave a trail behind them.
        if ((p.kind == ProjectileKind.MISSILE || p.kind == ProjectileKind.MORTAR) && frameCount % 2L == 0L) {
            game.effects.boosterWash(p.pos, -p.vel.normalized())
        }
    }

    private data class Quad(val r: Float, val g: Float, val b: Float, val size: Float)

    private fun drawEffects() {
        spriteProgram.use()
        spriteProgram.setMat4("uViewProj", camera.viewProj)
        val rx = camera.rightX(); val ry = camera.rightY(); val rz = camera.rightZ()
        val ux = camera.upX(); val uy = camera.upY(); val uz = camera.upZ()

        // Smoke first, straight alpha, so it sits behind the fire.
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        spriteProgram.setInt("uShape", 0)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_SMOKE, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_FIRE, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        spriteProgram.setInt("uShape", 1)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_RING, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        spriteProgram.setInt("uShape", 2)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_SPARK, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
    }

    // ---- 2D ------------------------------------------------------------------

    private fun drawOverlay() {
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        hudProgram.use()
        hudProgram.setMat4("uProj", ortho)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, font.textureId)
        hudProgram.setInt("uTex", 0)
        hudBatch.begin()
        painter.begin()

        when (game.state) {
            AppState.BATTLE -> {
                game.hud.draw(painter, game.battle, { p -> camera.project(p) }, smoothedFps)
                game.controls.draw(painter)
            }
            AppState.PAUSED -> {
                game.hud.draw(painter, game.battle, { p -> camera.project(p) }, 0f)
                game.pauseMenu.draw(painter, "PAUSED", "ROUND ${game.battle.roundNumber}", "TAP A LINE TO CHOOSE")
            }
            AppState.TITLE -> game.titleMenu.draw(
                painter,
                "ROLLERDASH ARENA",
                "ARMORED TROOPER DUEL",
                "TAP A ROW TO CHANGE  -  TAP START TO DEPLOY",
            )
            AppState.RESULT -> {
                val lines = game.resultLines()
                game.resultMenu.draw(painter, lines.first(), lines.drop(1).joinToString("   "), "TAP A LINE TO CHOOSE")
            }
        }
        painter.flush()
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
    }

    private fun red(c: Int) = ((c shr 16) and 0xFF) / 255f
    private fun green(c: Int) = ((c shr 8) and 0xFF) / 255f
    private fun blue(c: Int) = (c and 0xFF) / 255f

    private fun normalize(v: FloatArray): FloatArray {
        val l = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        return floatArrayOf(v[0] / l, v[1] / l, v[2] / l)
    }
}
