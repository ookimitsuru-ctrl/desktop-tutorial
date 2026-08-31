@file:Suppress("unused", "UNUSED_PARAMETER")

package android.media

/** Silent stubs: the preview renders pictures, not sound. */
object AudioManager

class AudioAttributes private constructor() {
    class Builder {
        fun setUsage(usage: Int): Builder = this
        fun setContentType(type: Int): Builder = this
        fun build(): AudioAttributes = AudioAttributes()
    }
    companion object {
        const val USAGE_GAME = 14
        const val CONTENT_TYPE_SONIFICATION = 4
    }
}

class AudioFormat private constructor() {
    class Builder {
        fun setEncoding(e: Int): Builder = this
        fun setSampleRate(r: Int): Builder = this
        fun setChannelMask(m: Int): Builder = this
        fun build(): AudioFormat = AudioFormat()
    }
    companion object {
        const val ENCODING_PCM_16BIT = 2
        const val CHANNEL_OUT_MONO = 4
    }
}

class AudioTrack private constructor() {
    class Builder {
        fun setAudioAttributes(a: AudioAttributes): Builder = this
        fun setAudioFormat(f: AudioFormat): Builder = this
        fun setBufferSizeInBytes(n: Int): Builder = this
        fun setTransferMode(m: Int): Builder = this
        fun build(): AudioTrack = AudioTrack()
    }

    fun play() = Unit
    fun pause() = Unit
    fun flush() = Unit
    fun release() = Unit
    fun write(data: ShortArray, offset: Int, size: Int): Int = size

    companion object {
        const val MODE_STREAM = 1
        @JvmStatic fun getMinBufferSize(rate: Int, channels: Int, encoding: Int) = 4096
    }
}
