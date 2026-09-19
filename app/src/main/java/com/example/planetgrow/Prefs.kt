package com.example.planetgrow

import android.content.Context
import com.example.planetgrow.core.PlanetState

/**
 * 惑星の状態をそのまま保存しておく。
 * アプリを閉じている間も地球時間は進むので、次に開いたときに追いつかせる。
 */
class PlanetPrefs(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun load(nowMillis: Long): PlanetState =
        PlanetState.load(sp.getString(KEY_STATE, null)) ?: PlanetState.newPlanet(nowMillis)

    fun save(state: PlanetState) {
        sp.edit().putString(KEY_STATE, state.save()).apply()
    }

    companion object {
        private const val NAME = "planet_grow"
        private const val KEY_STATE = "state_v1"
    }
}
