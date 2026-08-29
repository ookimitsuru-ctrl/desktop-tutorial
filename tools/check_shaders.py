"""
Compiles and links every shader in the game inside a real headless OpenGL ES 3
context, then checks that each uniform and attribute name the Kotlin sets
actually exists in the linked program.

Shader bugs otherwise only show up the first time the app runs on a device, and
a misspelled uniform name fails silently rather than loudly. This catches both
without an Android device or an emulator.

    sudo apt-get install -y libegl1 libgles2 libgl1-mesa-dri   # once
    LIBGL_ALWAYS_SOFTWARE=1 python3 tools/check_shaders.py

Exits non-zero if anything fails to compile, fails to link, or is set from
Kotlin but missing from the program.
"""
import ctypes
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(REPO, "app/src/main/kotlin/com/rollerdash/arena")

egl = ctypes.CDLL("libEGL.so.1")
gl = ctypes.CDLL("libGLESv2.so.2")

EGL_DEFAULT_DISPLAY = ctypes.c_void_p(0)
EGL_NO_CONTEXT = ctypes.c_void_p(0)
EGL_NO_SURFACE = ctypes.c_void_p(0)
EGL_PLATFORM_SURFACELESS_MESA = 0x31DD
EGL_OPENGL_ES_API = 0x30A0
EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT = 0x3040, 0x00000040
EGL_SURFACE_TYPE, EGL_PBUFFER_BIT = 0x3033, 0x0001
EGL_CONTEXT_CLIENT_VERSION = 0x3098
EGL_NONE = 0x3038

egl.eglGetProcAddress.restype = ctypes.c_void_p
egl.eglGetPlatformDisplayEXT = ctypes.CFUNCTYPE(
    ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)
)(egl.eglGetProcAddress(b"eglGetPlatformDisplayEXT"))

dpy = egl.eglGetPlatformDisplayEXT(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, None)
if not dpy:
    sys.exit("no EGL display")
major, minor = ctypes.c_int(), ctypes.c_int()
if not egl.eglInitialize(ctypes.c_void_p(dpy), ctypes.byref(major), ctypes.byref(minor)):
    sys.exit("eglInitialize failed")
egl.eglBindAPI(EGL_OPENGL_ES_API)

cfg_attrs = (ctypes.c_int * 7)(
    EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_NONE, 0, 0
)
config = ctypes.c_void_p()
n = ctypes.c_int()
if not egl.eglChooseConfig(ctypes.c_void_p(dpy), cfg_attrs, ctypes.byref(config), 1, ctypes.byref(n)) or n.value < 1:
    sys.exit("no GLES3 config")
ctx_attrs = (ctypes.c_int * 3)(EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE)
ctx = egl.eglCreateContext(ctypes.c_void_p(dpy), config, EGL_NO_CONTEXT, ctx_attrs)
if not ctx:
    sys.exit("eglCreateContext failed (0x%x)" % egl.eglGetError())
if not egl.eglMakeCurrent(ctypes.c_void_p(dpy), EGL_NO_SURFACE, EGL_NO_SURFACE, ctypes.c_void_p(ctx)):
    sys.exit("eglMakeCurrent failed (0x%x)" % egl.eglGetError())

gl.glGetString.restype = ctypes.c_char_p
print("GL_VERSION :", gl.glGetString(0x1F02).decode())
print("GLSL       :", gl.glGetString(0x8B8C).decode())
print("RENDERER   :", gl.glGetString(0x1F01).decode())
print()

GL_VERTEX_SHADER, GL_FRAGMENT_SHADER = 0x8B31, 0x8B30
GL_COMPILE_STATUS, GL_LINK_STATUS = 0x8B81, 0x8B82
GL_ACTIVE_UNIFORMS, GL_ACTIVE_ATTRIBUTES = 0x8B86, 0x8B89

def info_log(obj, is_program):
    buf = ctypes.create_string_buffer(8192)
    length = ctypes.c_int()
    (gl.glGetProgramInfoLog if is_program else gl.glGetShaderInfoLog)(
        obj, 8192, ctypes.byref(length), buf)
    return buf.value.decode(errors="replace").strip()

def compile_shader(kind, src, label):
    sh = gl.glCreateShader(kind)
    b = src.encode()
    arr = (ctypes.c_char_p * 1)(b)
    gl.glShaderSource(sh, 1, arr, None)
    gl.glCompileShader(sh)
    st = ctypes.c_int()
    gl.glGetShaderiv(sh, GL_COMPILE_STATUS, ctypes.byref(st))
    if not st.value:
        print("FAIL compile %s:\n%s\n" % (label, info_log(sh, False)))
        return None
    log = info_log(sh, False)
    if log:
        print("warn %s: %s" % (label, log))
    return sh

def actives(prog):
    names = set()
    for count_enum, getter in ((GL_ACTIVE_UNIFORMS, gl.glGetActiveUniform),
                               (GL_ACTIVE_ATTRIBUTES, gl.glGetActiveAttrib)):
        cnt = ctypes.c_int()
        gl.glGetProgramiv(prog, count_enum, ctypes.byref(cnt))
        for i in range(cnt.value):
            buf = ctypes.create_string_buffer(256)
            ln, size, typ = ctypes.c_int(), ctypes.c_int(), ctypes.c_uint()
            getter(prog, i, 256, ctypes.byref(ln), ctypes.byref(size), ctypes.byref(typ), buf)
            names.add(buf.value.decode().split("[")[0])
    return names

text = open(os.path.join(APP, "render/Shaders.kt")).read()
consts = dict(re.findall(r'const val (\w+) = """(.*?)"""', text, re.S))
print("found shader constants:", ", ".join(sorted(consts)), "\n")

pairs = [("solid", "SOLID_VS", "SOLID_FS"), ("floor", "SOLID_VS", "FLOOR_FS"),
         ("sky", "SOLID_VS", "SKY_FS"), ("sprite", "SPRITE_VS", "SPRITE_FS"),
         ("hud", "HUD_VS", "HUD_FS")]

failed = 0
program_actives = {}
for name, vs_key, fs_key in pairs:
    vs = compile_shader(GL_VERTEX_SHADER, consts[vs_key], name + ".vert")
    fs = compile_shader(GL_FRAGMENT_SHADER, consts[fs_key], name + ".frag")
    if vs is None or fs is None:
        failed += 1
        continue
    prog = gl.glCreateProgram()
    gl.glAttachShader(prog, vs)
    gl.glAttachShader(prog, fs)
    gl.glLinkProgram(prog)
    st = ctypes.c_int()
    gl.glGetProgramiv(prog, GL_LINK_STATUS, ctypes.byref(st))
    if not st.value:
        print("FAIL link %s:\n%s\n" % (name, info_log(prog, True)))
        failed += 1
        continue
    names = actives(prog)
    program_actives[name] = names
    print("OK   %-7s linked; active: %s" % (name, ", ".join(sorted(names))))


# --- do the names the Kotlin sets actually exist in the programs? -------------

VAR_TO_PROGRAM = {
    "solidProgram": "solid", "floorProgram": "floor", "skyProgram": "sky",
    "spriteProgram": "sprite", "hudProgram": "hud",
}

mismatches = []

def expect(program, name, where):
    if program in program_actives and name not in program_actives[program]:
        mismatches.append("%s sets '%s' on the %s program, which has no such active "
                          "uniform or attribute" % (where, name, program))

renderer = open(os.path.join(APP, "render/GameRenderer.kt")).read()
for var, uniform in re.findall(r'(\w+Program)\.set\w+\("(\w+)"', renderer):
    if var in VAR_TO_PROGRAM:
        expect(VAR_TO_PROGRAM[var], uniform, "GameRenderer")

hud = open(os.path.join(APP, "render/Hud.kt")).read()
for uniform in re.findall(r'program\.set\w+\("(\w+)"', hud):
    expect("hud", uniform, "HudPainter")

for path, programs in (("gl/Mesh.kt", ["solid", "floor", "sky"]),
                       ("gl/QuadBatch.kt", ["sprite", "hud"])):
    src = open(os.path.join(APP, path)).read()
    for attribute in re.findall(r'attrib\("(\w+)"\)', src):
        for program in programs:
            expect(program, attribute, path)

print()
if mismatches:
    print("NAME MISMATCHES:")
    for m in mismatches:
        print(" -", m)
else:
    print("every uniform and attribute the Kotlin sets exists in the linked programs")

sys.exit(1 if failed or mismatches else 0)
