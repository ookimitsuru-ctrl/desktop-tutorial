package com.bujo.app

import android.app.Application
import com.bujo.app.di.AppContainer

class BujoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
