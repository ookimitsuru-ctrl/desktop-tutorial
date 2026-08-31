package com.rollerdash.arena.render

import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import com.rollerdash.arena.AppState
import com.rollerdash.arena.Game
import com.rollerdash.arena.core.Mech
import com.rollerdash.arena.core.Obstacle
import com.rollerdash.arena.core.Projectile
import com.rollerdash.arena.core.ProjectileKind
import com.rollerdash.arena.core.Rng
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.segmentT
import com.rollerdash.arena.gl.MatrixStack
import com.rollerdash.arena.gl.Mesh
import com.rollerdash.arena.gl.MeshBuilder
import com.rollerdash.arena.gl.QuadBatch
import com.rollerdash.arena.gl.ShaderProgram
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The frame, start to finish:
 *
 *   1. the sun renders the scene into a shadow map
 *   2. the scene is drawn in linear light into a floating point target
 *   3. the bright parts are extracted and blurred
 *   4. tone mapping, bloom, vignette and grain composite it to the screen
 *   5. the HUD is drawn last, in plain colour, so text stays crisp
 *
 * Nothing is loaded from disk: meshes, the skyline, the font and every particle
 * are built at startup.
 */
class GameRenderer(private val game: Game) : GLSurfaceView.Renderer {

    // ---- environment ---------------------------------------------------------

    private val sunDir = normalize(floatArrayOf(0.46f, 0.62f, 0.34f))
    private val sunColor = floatArrayOf(1.00f, 0.80f, 0.56f)
    private val sunIntensity = 2.75f
    // Ambient has to carry the shadows on its own, so it is not allowed to be black.
    private val skyAmbient = floatArrayOf(0.24f, 0.31f, 0.48f)
    private val groundAmbient = floatArrayOf(0.20f, 0.15f, 0.10f)
    private val fogColor = floatArrayOf(0.26f, 0.25f, 0.24f)
    private val fogDensity = 0.0048f
    private val exposure = 0.55f

    // ---- gl objects ----------------------------------------------------------

    private lateinit var solidProgram: ShaderProgram
    private lateinit var floorProgram: ShaderProgram
    private lateinit var skyProgram: ShaderProgram
    private lateinit var backdropProgram: ShaderProgram
    private lateinit var depthProgram: ShaderProgram
    private lateinit var spriteProgram: ShaderProgram
    private lateinit var hudProgram: ShaderProgram
    private lateinit var brightProgram: ShaderProgram
    private lateinit var blurProgram: ShaderProgram
    private lateinit var compositeProgram: ShaderProgram
    private lateinit var fxaaProgram: ShaderProgram

    private lateinit var boxMesh: Mesh
    private lateinit var cylMesh: Mesh
    private lateinit var groundMesh: Mesh
    private lateinit var skyMesh: Mesh
    private lateinit var ruinsMesh: Mesh
    private lateinit var propConcreteMesh: Mesh
    private lateinit var propMetalMesh: Mesh
    private lateinit var propLampMesh: Mesh

    private lateinit var mechModel: MechModel
    private lateinit var font: FontAtlas
    private lateinit var spriteBatch: QuadBatch
    private lateinit var hudBatch: QuadBatch
    private lateinit var painter: HudPainter

    private var scene: RenderTarget? = null
    private var graded: RenderTarget? = null
    private var bloom: BloomChain? = null
    private lateinit var shadowMap: ShadowMap

    val camera = Camera()

    /**
     * Framebuffer the finished frame lands in. Zero is the window, which is what
     * the game uses; the offscreen preview points this at its own target.
     */
    var outputFramebuffer = 0

    /** When positive, overrides the wall-clock delta - used to render deterministic frames. */
    var fixedTimeStep = 0f

    private val stack = MatrixStack()
    private val mvp = FloatArray(16)
    private val ortho = FloatArray(16)
    private val modelScratch = FloatArray(16)
    private val lightView = FloatArray(16)
    private val lightProj = FloatArray(16)
    private val lightViewProj = FloatArray(16)

    private var lastFrameNs = 0L
    private var smoothedFps = 60f
    private var elapsed = 0f
    private var frameCount = 0L
    private var lastMesh: Mesh? = null
    private var viewWidth = 1
    private var viewHeight = 1

    /** Cover standing between the camera and the player, drawn see-through. */
    private val occluders = ArrayList<Obstacle>()

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        solidProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.SOLID_FS, "solid")
        floorProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.FLOOR_FS, "floor")
        skyProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.SKY_FS, "sky")
        backdropProgram = ShaderProgram(Shaders.SOLID_VS, Shaders.BACKDROP_FS, "backdrop")
        depthProgram = ShaderProgram(Shaders.DEPTH_VS, Shaders.DEPTH_FS, "depth")
        spriteProgram = ShaderProgram(Shaders.SPRITE_VS, Shaders.SPRITE_FS, "sprite")
        hudProgram = ShaderProgram(Shaders.HUD_VS, Shaders.HUD_FS, "hud")
        brightProgram = ShaderProgram(Shaders.POST_VS, Shaders.BRIGHT_FS, "bright")
        blurProgram = ShaderProgram(Shaders.POST_VS, Shaders.BLUR_FS, "blur")
        compositeProgram = ShaderProgram(Shaders.POST_VS, Shaders.COMPOSITE_FS, "composite")
        fxaaProgram = ShaderProgram(Shaders.POST_VS, Shaders.FXAA_FS, "fxaa")

        boxMesh = MeshBuilder.box()
        cylMesh = MeshBuilder.cylinder(20)
        groundMesh = MeshBuilder.groundQuad()
        skyMesh = MeshBuilder.skyDome(12, 24)
        ruinsMesh = buildRuins()
        propConcreteMesh = buildRubble()
        propMetalMesh = buildMetalProps()
        propLampMesh = buildLamps()

        mechModel = MechModel(boxMesh, cylMesh)
        font = FontAtlas()
        spriteBatch = QuadBatch(3000)
        hudBatch = QuadBatch(1600)
        painter = HudPainter(hudBatch, hudProgram, font)
        shadowMap = ShadowMap(2048)

        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glCullFace(GLES30.GL_BACK)
        lastFrameNs = System.nanoTime()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        viewWidth = width
        viewHeight = height
        GLES30.glViewport(0, 0, width, height)
        camera.resize(width, height)
        Matrix.orthoM(ortho, 0, 0f, width.toFloat(), height.toFloat(), 0f, -1f, 1f)
        game.layout(width, height)

        scene?.release()
        graded?.release()
        bloom?.release()
        scene = RenderTarget(width, height, GLES30.GL_R11F_G11F_B10F, withDepth = true)
        graded = RenderTarget(width, height, GLES30.GL_RGBA8)
        bloom = BloomChain(width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        val now = System.nanoTime()
        var dt = (now - lastFrameNs) / 1_000_000_000f
        lastFrameNs = now
        if (dt > 0.1f) dt = 0.1f
        if (dt <= 0f) dt = 1f / 60f
        if (fixedTimeStep > 0f) dt = fixedTimeStep
        elapsed += dt
        frameCount++
        smoothedFps = smoothedFps * 0.92f + (1f / dt) * 0.08f

        game.update(dt)

        val battle = game.battle
        for (i in battle.mechs.indices) {
            mechModel.update(game.renderStates[i], battle.mechs[i], dt)
        }
        if (game.state == AppState.BATTLE || game.state == AppState.PAUSED) {
            camera.updateBattle(dt, battle, game.cameraShake, game.dramaFocus)
        } else {
            camera.updateOrbit(dt, battle)
        }

        renderShadowMap()
        renderScene()
        renderBloom()
        composite()
        antialias()
        drawOverlay()
    }

    // ---- shadows -------------------------------------------------------------

    private fun renderShadowMap() {
        val battle = game.battle
        // Fit the sun's box around the two machines: small box, sharp shadows.
        val mid = (battle.player.center + battle.enemy.center) * 0.5f
        val spread = clamp(battle.player.center.distanceTo(battle.enemy.center) * 0.5f + 14f, 18f, 46f)
        val eye = mid + Vec3(sunDir[0], sunDir[1], sunDir[2]) * 90f
        Matrix.setLookAtM(lightView, 0, eye.x, eye.y, eye.z, mid.x, mid.y, mid.z, 0f, 1f, 0f)
        Matrix.orthoM(lightProj, 0, -spread, spread, -spread, spread, 10f, 190f)
        Matrix.multiplyMM(lightViewProj, 0, lightProj, 0, lightView, 0)

        shadowMap.bind()
        GLES30.glClear(GLES30.GL_DEPTH_BUFFER_BIT)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
        // Front-face culling in the depth pass keeps acne off the lit surfaces.
        GLES30.glEnable(GLES30.GL_CULL_FACE)
        GLES30.glCullFace(GLES30.GL_FRONT)

        depthProgram.use()
        lastMesh = null
        for (o in game.arena.obstacles) {
            when (o) {
                is Obstacle.Box -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.halfX * 2f, o.height, o.halfZ * 2f)
                    drawDepth(boxMesh, modelScratch)
                }
                is Obstacle.Cylinder -> {
                    placeBox(o.center.x, o.height * 0.5f, o.center.z, o.radius * 2f, o.height, o.radius * 2f)
                    drawDepth(cylMesh, modelScratch)
                }
            }
        }
        Matrix.setIdentityM(modelScratch, 0)
        drawDepth(propConcreteMesh, modelScratch)
        drawDepth(propMetalMesh, modelScratch)
        for ((i, mech) in game.battle.mechs.withIndex()) {
            stack.identity()
            stack.translate(mech.pos.x, mech.pos.y, mech.pos.z)
            mechModel.draw(mech, game.renderStates[i], stack) { mesh, model, _, _, _ ->
                drawDepth(mesh, model)
            }
        }
        GLES30.glCullFace(GLES30.GL_BACK)
    }

    private fun drawDepth(mesh: Mesh, model: FloatArray) {
        Matrix.multiplyMM(mvp, 0, lightViewProj, 0, model, 0)
        depthProgram.setMat4("uMVP", mvp)
        if (lastMesh !== mesh) {
            mesh.bind(depthProgram)
            lastMesh = mesh
        }
        mesh.draw()
    }

    // ---- scene ---------------------------------------------------------------

    private fun renderScene() {
        val target = scene ?: return
        target.bind()
        GLES30.glClearColor(fogColor[0], fogColor[1], fogColor[2], 1f)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glEnable(GLES30.GL_CULL_FACE)

        shadowMap.bindTexture(1)

        drawSky()
        drawRuins()
        drawFloor()
        drawWorldGeometry()
        drawMechs()
        drawOccluders()
        drawProjectiles()
        drawEffects()
    }

    /** Uniforms every surface shader shares. */
    private fun applyEnvironment(p: ShaderProgram) {
        p.setVec3("uLightDir", sunDir[0], sunDir[1], sunDir[2])
        p.setVec3("uSunColor", sunColor[0] * sunIntensity, sunColor[1] * sunIntensity, sunColor[2] * sunIntensity)
        p.setVec3("uSkyColor", skyAmbient[0], skyAmbient[1], skyAmbient[2])
        p.setVec3("uGroundColor", groundAmbient[0], groundAmbient[1], groundAmbient[2])
        p.setVec3("uCameraPos", camera.position.x, camera.position.y, camera.position.z)
        p.setVec3("uFogColor", fogColor[0], fogColor[1], fogColor[2])
        p.setFloat("uFogDensity", fogDensity)
        p.setFloat("uTime", elapsed)
        p.setMat4("uLightViewProj", lightViewProj)
        p.setInt("uShadowMap", 1)
        p.setFloat("uShadowTexel", shadowMap.texelSize)
        GLES30.glUniform4fv(p.uniform("uPointPos"), 4, game.lights.positions, 0)
        GLES30.glUniform3fv(p.uniform("uPointColor"), 4, game.lights.colors, 0)
    }

    private fun drawSky() {
        GLES30.glDepthMask(false)
        GLES30.glCullFace(GLES30.GL_FRONT)
        skyProgram.use()
        applyEnvironment(skyProgram)
        val p = camera.position
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.translateM(modelScratch, 0, p.x, p.y - 18f, p.z)
        Matrix.scaleM(modelScratch, 0, 380f, 240f, 380f)
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, modelScratch, 0)
        skyProgram.setMat4("uMVP", mvp)
        skyProgram.setVec3("uHorizon", 0.48f, 0.34f, 0.24f)
        skyProgram.setVec3("uZenith", 0.05f, 0.10f, 0.26f)
        skyMesh.bind(skyProgram)
        skyMesh.draw()
        GLES30.glCullFace(GLES30.GL_BACK)
        GLES30.glDepthMask(true)
        lastMesh = null
    }

    private fun drawRuins() {
        backdropProgram.use()
        applyEnvironment(backdropProgram)
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, modelScratch, 0)
        backdropProgram.setMat4("uMVP", mvp)
        backdropProgram.setMat4("uModel", modelScratch)
        backdropProgram.setVec4("uColor", 0.12f, 0.11f, 0.105f, 1f)
        ruinsMesh.bind(backdropProgram)
        ruinsMesh.draw()
        lastMesh = null
    }

    private fun drawFloor() {
        val arena = game.arena
        floorProgram.use()
        applyEnvironment(floorProgram)
        floorProgram.setFloat("uHalfSize", arena.halfSize)
        floorProgram.setVec4("uColor", 0.125f, 0.124f, 0.118f, 1f)
        Matrix.setIdentityM(modelScratch, 0)
        Matrix.scaleM(modelScratch, 0, arena.halfSize * 6f, 1f, arena.halfSize * 6f)
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, modelScratch, 0)
        floorProgram.setMat4("uMVP", mvp)
        floorProgram.setMat4("uModel", modelScratch)
        groundMesh.bind(floorProgram)
        groundMesh.draw()
        lastMesh = null
    }

    private fun beginSolid() {
        solidProgram.use()
        applyEnvironment(solidProgram)
        solidProgram.setFloat("uEmissive", 0f)
        solidProgram.setVec3("uFlash", 0f, 0f, 0f)
        solidProgram.setInt("uMaterial", MATERIAL_ARMOR)
        solidProgram.setFloat("uPanelScale", 1.6f)
        solidProgram.setFloat("uWear", 0.4f)
        lastMesh = null
    }

    private fun drawSolid(
        mesh: Mesh,
        model: FloatArray,
        color: Int,
        emissive: Float,
        flash: Float = 0f,
        alpha: Float = 1f,
        material: Int = MATERIAL_ARMOR,
        panelScale: Float = 1.6f,
        wear: Float = 0.4f,
    ) {
        Matrix.multiplyMM(mvp, 0, camera.viewProj, 0, model, 0)
        solidProgram.setMat4("uMVP", mvp)
        solidProgram.setMat4("uModel", model)
        solidProgram.setVec4("uColor", linear(red(color)), linear(green(color)), linear(blue(color)), alpha)
        solidProgram.setFloat("uEmissive", emissive)
        solidProgram.setVec3("uFlash", flash * 1.15f, flash * 0.22f, flash * 0.14f)
        solidProgram.setInt("uMaterial", material)
        solidProgram.setFloat("uPanelScale", panelScale)
        solidProgram.setFloat("uWear", wear)
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
        val wallH = 18f
        val t = 3f
        for (s in intArrayOf(-1, 1)) {
            placeBox(0f, wallH * 0.5f, s * (h + t * 0.5f), h * 2f + t * 2f, wallH, t)
            drawSolid(boxMesh, modelScratch, 0x45494C, 0f, material = MATERIAL_CONCRETE)
            placeBox(s * (h + t * 0.5f), wallH * 0.5f, 0f, t, wallH, h * 2f)
            drawSolid(boxMesh, modelScratch, 0x4A4E51, 0f, material = MATERIAL_CONCRETE)
            // Buttress ribs, so the wall is not one flat slab.
            for (i in -3..3) {
                placeBox(i * 15f, wallH * 0.34f, s * (h - 0.8f), 2.4f, wallH * 0.68f, 1.6f)
                drawSolid(boxMesh, modelScratch, 0x53585B, 0f, material = MATERIAL_CONCRETE)
                placeBox(s * (h - 0.8f), wallH * 0.34f, i * 15f, 1.6f, wallH * 0.68f, 2.4f)
                drawSolid(boxMesh, modelScratch, 0x53585B, 0f, material = MATERIAL_CONCRETE)
            }
            placeBox(0f, 0.9f, s * (h - 0.3f), h * 2f, 1.8f, 0.5f)
            drawSolid(boxMesh, modelScratch, 0xC08A22, 0.06f, material = MATERIAL_ARMOR, panelScale = 0.5f, wear = 0.9f)
            placeBox(s * (h - 0.3f), 0.9f, 0f, 0.5f, 1.8f, h * 2f)
            drawSolid(boxMesh, modelScratch, 0xC08A22, 0.06f, material = MATERIAL_ARMOR, panelScale = 0.5f, wear = 0.9f)
        }

        // Set dressing: rubble, drums, floodlight masts, and one machine that
        // did not make it out of an earlier round.
        Matrix.setIdentityM(modelScratch, 0)
        drawSolid(propConcreteMesh, modelScratch, 0x5A5E60, 0f, material = MATERIAL_CONCRETE, panelScale = 1.0f)
        drawSolid(propMetalMesh, modelScratch, 0x6B6257, 0f, material = MATERIAL_METAL, panelScale = 2.2f)
        drawSolid(propLampMesh, modelScratch, 0xFFE2A8, 0.85f, material = MATERIAL_LENS)

        occluders.clear()
        val eye = camera.position
        val target = game.battle.player.center
        for (o in arena.obstacles) {
            if (o.segmentT(eye, target) != null) {
                occluders += o
                continue
            }
            drawObstacle(o, 1f, 0f)
        }
    }

    private fun drawObstacle(o: Obstacle, alpha: Float, emissive: Float) {
        when (o) {
            is Obstacle.Box -> {
                placeBox(o.center.x, o.height * 0.5f, o.center.z, o.halfX * 2f, o.height, o.halfZ * 2f)
                drawSolid(boxMesh, modelScratch, 0x585C5E, emissive, alpha = alpha, material = MATERIAL_CONCRETE)
                placeBox(o.center.x, o.height + 0.16f, o.center.z, o.halfX * 2f + 0.6f, 0.32f, o.halfZ * 2f + 0.6f)
                drawSolid(boxMesh, modelScratch, 0x6A6E70, emissive, alpha = alpha, material = MATERIAL_CONCRETE)
            }
            is Obstacle.Cylinder -> {
                placeBox(o.center.x, o.height * 0.5f, o.center.z, o.radius * 2f, o.height, o.radius * 2f)
                drawSolid(cylMesh, modelScratch, 0x5C6062, emissive, alpha = alpha, material = MATERIAL_CONCRETE)
                placeBox(o.center.x, o.height + 0.2f, o.center.z, o.radius * 2.5f, 0.4f, o.radius * 2.5f)
                drawSolid(cylMesh, modelScratch, 0x707476, emissive, alpha = alpha, material = MATERIAL_CONCRETE)
                placeBox(o.center.x, 0.6f, o.center.z, o.radius * 2.6f, 1.2f, o.radius * 2.6f)
                drawSolid(cylMesh, modelScratch, 0x666A6C, emissive, alpha = alpha, material = MATERIAL_CONCRETE)
            }
        }
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
            val blink = if (mech.invuln > 0f && ((elapsed * 14f).toInt() % 2 == 0)) 0.3f else 0f
            stack.identity()
            stack.translate(mech.pos.x, mech.pos.y, mech.pos.z)
            mechModel.draw(mech, game.renderStates[i], stack) { mesh, model, color, emissive, material ->
                drawSolid(
                    mesh, model, color, maxOf(emissive, blink), mech.tookDamageFlash,
                    material = material,
                    panelScale = if (material == MATERIAL_ARMOR) 2.4f else 4.5f,
                    wear = 0.30f + (1f - mech.armorFraction) * 0.55f,
                )
            }
        }
    }

    /**
     * Cover in the way of the shot is drawn as a ghost: blended, writing no
     * depth, after the mechs, so the machine reads straight through it.
     */
    private fun drawOccluders() {
        if (occluders.isEmpty()) return
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        GLES30.glDepthMask(false)
        beginSolid()
        for (o in occluders) drawObstacle(o, 0.26f, 0.10f)
        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
    }

    // ---- sprites -------------------------------------------------------------

    private fun beginSprites(shape: Int, intensity: Float) {
        spriteProgram.use()
        spriteProgram.setMat4("uViewProj", camera.viewProj)
        spriteProgram.setInt("uShape", shape)
        spriteProgram.setFloat("uIntensity", intensity)
        spriteProgram.setVec3("uFogColor", fogColor[0], fogColor[1], fogColor[2])
        spriteProgram.setVec3("uCameraPos", camera.position.x, camera.position.y, camera.position.z)
        spriteProgram.setFloat("uFogDensity", fogDensity)
    }

    private fun drawProjectiles() {
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE)
        GLES30.glDepthMask(false)
        beginSprites(2, 4.5f)
        spriteBatch.begin()
        for (p in game.battle.projectiles) projectileQuad(p)
        spriteBatch.flush(spriteProgram)
    }

    private fun projectileQuad(p: Projectile) {
        val (r, g, b, size) = when (p.kind) {
            ProjectileKind.BULLET -> Quad(1f, 0.80f, 0.38f, 0.5f)
            ProjectileKind.PLASMA -> Quad(0.45f, 0.90f, 1f, 0.9f)
            ProjectileKind.MISSILE -> Quad(1f, 0.62f, 0.30f, 0.75f)
            ProjectileKind.MORTAR -> Quad(1f, 0.52f, 0.24f, 0.85f)
            ProjectileKind.NAPALM -> Quad(1f, 0.42f, 0.16f, 1.2f)
            ProjectileKind.MELEE -> return
        }
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
            val stretch = half * (1.6f + minOf(p.vel.length * 0.045f, 9f))
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
        if ((p.kind == ProjectileKind.MISSILE || p.kind == ProjectileKind.MORTAR) && frameCount % 2L == 0L) {
            game.effects.boosterWash(p.pos, -p.vel.normalized())
        }
    }

    private data class Quad(val r: Float, val g: Float, val b: Float, val size: Float)

    private fun drawEffects() {
        val rx = camera.rightX(); val ry = camera.rightY(); val rz = camera.rightZ()
        val ux = camera.upX(); val uy = camera.upY(); val uz = camera.upZ()

        // Scorch marks go down first: they are part of the ground, not the air.
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        beginSprites(0, 1f)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_SCORCH, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        // Then smoke, straight alpha, so the fire reads in front of it.
        beginSprites(4, 0.85f)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_SMOKE, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE)
        beginSprites(0, 2.1f)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_FIRE, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        beginSprites(1, 1.9f)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_RING, rx, ry, rz, ux, uy, uz)
        game.effects.emitQuads(spriteBatch, Effects.PASS_GROUND_RING, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        beginSprites(2, 4.6f)
        spriteBatch.begin()
        game.effects.emitQuads(spriteBatch, Effects.PASS_SPARK, rx, ry, rz, ux, uy, uz)
        spriteBatch.flush(spriteProgram)

        GLES30.glDepthMask(true)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glEnable(GLES30.GL_CULL_FACE)
    }

    // ---- post ----------------------------------------------------------------

    private fun fullscreen() {
        for (i in 0 until 4) GLES30.glDisableVertexAttribArray(i)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 3)
    }

    private fun renderBloom() {
        val target = scene ?: return
        val chain = bloom ?: return
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        chain.run(target, brightProgram, blurProgram) { fullscreen() }
    }

    private fun composite() {
        val target = scene ?: return
        val chain = bloom ?: return
        val out = graded
        if (out != null) out.bind() else {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outputFramebuffer)
            GLES30.glViewport(0, 0, viewWidth, viewHeight)
        }
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
        compositeProgram.use()
        target.bindTexture(0)
        compositeProgram.setInt("uScene", 0)
        chain.result.bindTexture(1)
        compositeProgram.setInt("uBloom", 1)
        compositeProgram.setFloat("uBloomStrength", 0.85f)
        compositeProgram.setFloat("uExposure", exposure)
        compositeProgram.setFloat("uTime", elapsed)
        val player = game.battle.player
        val dashing = if (game.state == AppState.BATTLE && player.dashing) 1f else 0f
        compositeProgram.setFloat("uDashBlur", dashing)
        val damage = if (game.state == AppState.BATTLE) {
            // Only a hint of red as the armour runs out; it must not fight the game.
            clamp((0.30f - player.armorFraction) / 0.30f, 0f, 1f) * 0.35f
        } else {
            0f
        }
        compositeProgram.setFloat("uDamage", damage)
        val aspect = viewWidth.toFloat() / maxOf(1, viewHeight).toFloat()
        compositeProgram.setVec2("uAspect", maxOf(1f, aspect), maxOf(1f, 1f / aspect))
        fullscreen()
    }

    /** Resolves the graded image to the screen, smoothing the stair-steps. */
    private fun antialias() {
        val source = graded ?: return
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outputFramebuffer)
        GLES30.glViewport(0, 0, viewWidth, viewHeight)
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
        fxaaProgram.use()
        source.bindTexture(0)
        fxaaProgram.setInt("uImage", 0)
        fxaaProgram.setVec2("uTexel", 1f / viewWidth, 1f / viewHeight)
        fullscreen()
    }

    // ---- 2D ------------------------------------------------------------------

    private fun drawOverlay() {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outputFramebuffer)
        GLES30.glViewport(0, 0, viewWidth, viewHeight)
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
            AppState.TITLE -> {
                game.titleMenu.draw(
                    painter,
                    "ROLLERDASH ARENA",
                    "ARMORED TROOPER DUEL",
                    "",
                )
                val unit = minOf(viewWidth * 0.55f, viewHeight.toFloat())
                val cardW = unit * 0.46f
                game.hud.drawSpecCard(
                    painter, game.previewSpec,
                    viewWidth - unit * 0.05f - cardW,
                    viewHeight - unit * 0.05f - unit * 0.34f,
                    cardW, unit,
                )
            }
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

    // ---- scenery -------------------------------------------------------------

    /** Broken slabs and craters pushed against the walls of the pit. */
    private fun buildRubble(): Mesh {
        val b = MeshBuilder()
        val rng = Rng(4242L)
        repeat(46) {
            val angle = rng.range(0f, 6.28318f)
            val dist = rng.range(44f, 57f)
            val x = sin(angle) * dist
            val z = cos(angle) * dist
            val chunks = 2 + rng.nextInt(4)
            for (c in 0 until chunks) {
                val w = rng.range(0.8f, 3.2f)
                val hgt = rng.range(0.25f, 0.9f)
                b.addBox(
                    x + rng.range(-1.8f, 1.8f), hgt * 0.5f, z + rng.range(-1.8f, 1.8f),
                    w, hgt, rng.range(0.8f, 3.0f), rng.range(0.8f, 1.05f),
                )
            }
        }
        return b.build()
    }

    /** Fuel drums, crates and a wrecked trooper against the north wall. */
    private fun buildMetalProps(): Mesh {
        val b = MeshBuilder()
        val rng = Rng(777L)
        repeat(22) {
            val angle = rng.range(0f, 6.28318f)
            val dist = rng.range(48f, 57f)
            val x = sin(angle) * dist
            val z = cos(angle) * dist
            if (rng.chance(0.55f)) {
                // Drum, mostly knocked over: nothing here should stand tall
                // enough for a machine to look like it is walking through it.
                if (rng.chance(0.35f)) {
                    b.addBox(x, 0.55f, z, 1.0f, 1.1f, 1.0f, 0.95f)
                    b.addBox(x, 1.12f, z, 1.1f, 0.10f, 1.1f, 1.05f)
                } else {
                    b.addBox(x, 0.45f, z, 1.4f, 0.9f, 1.0f, 0.9f)
                }
            } else {
                b.addBox(x, 0.45f, z, rng.range(1.4f, 2.4f), 0.9f, rng.range(1.4f, 2.2f), 0.92f)
            }
        }
        // Floodlight masts stand outside the pit and look in over the wall.
        for (sx in intArrayOf(-1, 1)) {
            for (sz in intArrayOf(-1, 1)) {
                val x = sx * 68f
                val z = sz * 68f
                b.addBox(x, 11f, z, 1.4f, 22f, 1.4f, 0.9f)
                b.addBox(x, 1.2f, z, 3.2f, 0.6f, 3.2f, 0.8f)
                b.addBox(x - sx * 1.4f, 21.4f, z - sz * 1.4f, 3.6f, 1.1f, 3.6f, 1.0f)
            }
        }
        // The wreck: a trooper that lost, face down in a corner.
        val wx = -52f
        val wz = 46f
        b.addBox(wx, 1.1f, wz, 4.4f, 2.2f, 3.0f, 0.85f)
        b.addBox(wx + 2.4f, 0.7f, wz + 1.2f, 3.2f, 1.4f, 1.6f, 0.8f)
        b.addBox(wx - 2.6f, 0.6f, wz - 1.0f, 2.6f, 1.2f, 1.4f, 0.8f)
        b.addBox(wx + 0.6f, 2.6f, wz - 1.6f, 1.8f, 1.0f, 1.6f, 0.9f)
        return b.build()
    }

    /** The lamp heads themselves, drawn as emissive so they bloom at dusk. */
    private fun buildLamps(): Mesh {
        val b = MeshBuilder()
        for (sx in intArrayOf(-1, 1)) {
            for (sz in intArrayOf(-1, 1)) {
                b.addBox(sx * 68f - sx * 1.8f, 21.0f, sz * 68f - sz * 1.8f, 2.6f, 0.6f, 2.6f, 1f)
            }
        }
        return b.build()
    }

    /** A ring of bombed-out blocks on the horizon, so the pit sits in a place. */
    private fun buildRuins(): Mesh {
        val b = MeshBuilder()
        val rng = Rng(90210L)
        val count = 150
        for (i in 0 until count) {
            val angle = (i.toFloat() / count) * 6.28318f + rng.range(-0.02f, 0.02f)
            val dist = rng.range(130f, 300f)
            val x = sin(angle) * dist
            val z = cos(angle) * dist
            val w = rng.range(10f, 30f)
            val d = rng.range(10f, 30f)
            val hgt = rng.range(12f, 74f) * (1f - (dist - 130f) / 340f)
            b.addBox(x, hgt * 0.5f, z, w, hgt, d, rng.range(0.75f, 1.05f))
            // A broken upper storey on some of them.
            if (rng.chance(0.45f)) {
                val hw = w * rng.range(0.35f, 0.7f)
                val hh = rng.range(4f, 16f)
                b.addBox(
                    x + rng.range(-w * 0.2f, w * 0.2f), hgt + hh * 0.5f,
                    z + rng.range(-d * 0.2f, d * 0.2f), hw, hh, d * rng.range(0.4f, 0.8f),
                    rng.range(0.7f, 1f),
                )
            }
        }
        // A couple of leaning towers to break the skyline.
        for (i in 0 until 6) {
            val angle = rng.range(0f, 6.28318f)
            val dist = rng.range(150f, 250f)
            b.addBox(sin(angle) * dist, 55f, cos(angle) * dist, 12f, 110f, 12f, 0.9f)
        }
        return b.build()
    }

    private fun red(c: Int) = ((c shr 16) and 0xFF) / 255f
    private fun green(c: Int) = ((c shr 8) and 0xFF) / 255f
    private fun blue(c: Int) = (c and 0xFF) / 255f

    /** Art is authored in sRGB; lighting happens in linear. */
    private fun linear(v: Float) = if (v <= 0.04045f) v / 12.92f else Math.pow(((v + 0.055f) / 1.055f).toDouble(), 2.4).toFloat()

    private fun normalize(v: FloatArray): FloatArray {
        val l = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        return floatArrayOf(v[0] / l, v[1] / l, v[2] / l)
    }

    private companion object {
        const val MATERIAL_ARMOR = 0
        const val MATERIAL_METAL = 1
        const val MATERIAL_LENS = 2
        const val MATERIAL_CONCRETE = 3
    }
}
