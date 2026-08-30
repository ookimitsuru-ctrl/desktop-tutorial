package com.bujo.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Update
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.bujo.app.di.rememberRepository
import com.bujo.app.ui.screens.collections.CollectionDetailScreen
import com.bujo.app.ui.screens.collections.CollectionDetailViewModel
import com.bujo.app.ui.screens.collections.CollectionsScreen
import com.bujo.app.ui.screens.collections.CollectionsViewModel
import com.bujo.app.ui.screens.daily.DailyScreen
import com.bujo.app.ui.screens.daily.DailyViewModel
import com.bujo.app.ui.screens.future.FutureLogScreen
import com.bujo.app.ui.screens.future.FutureLogViewModel
import com.bujo.app.ui.screens.index.IndexScreen
import com.bujo.app.ui.screens.index.IndexViewModel
import com.bujo.app.ui.screens.migration.MigrationScreen
import com.bujo.app.ui.screens.migration.MigrationViewModel
import com.bujo.app.ui.screens.monthly.MonthlyScreen
import com.bujo.app.ui.screens.monthly.MonthlyViewModel
import com.bujo.app.ui.screens.search.SearchScreen
import com.bujo.app.ui.screens.search.SearchViewModel

object Routes {
    const val DAILY = "daily"
    const val MONTHLY = "monthly"
    const val FUTURE = "future"
    const val COLLECTIONS = "collections"
    const val INDEX = "index"
    const val SEARCH = "search"
    const val MIGRATION = "migration"
    const val COLLECTION_DETAIL = "collection/{collectionId}"

    fun collectionDetail(id: Long) = "collection/$id"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.DAILY, "デイリー", Icons.Default.EditNote),
    Tab(Routes.MONTHLY, "マンスリー", Icons.Default.CalendarMonth),
    Tab(Routes.FUTURE, "フューチャー", Icons.Default.Update),
    Tab(Routes.COLLECTIONS, "コレクション", Icons.Default.Folder),
    Tab(Routes.INDEX, "インデックス", Icons.AutoMirrored.Filled.MenuBook)
)

@Composable
fun BujoApp() {
    val repository = rememberRepository()
    val factory = remember(repository) { bujoViewModelFactory(repository) }
    val navController = rememberNavController()

    // 画面をまたいで状態を共有したいので Activity スコープで生成する
    val dailyViewModel: DailyViewModel = viewModel(factory = factory)
    val monthlyViewModel: MonthlyViewModel = viewModel(factory = factory)
    val futureViewModel: FutureLogViewModel = viewModel(factory = factory)
    val collectionsViewModel: CollectionsViewModel = viewModel(factory = factory)
    val indexViewModel: IndexViewModel = viewModel(factory = factory)
    val searchViewModel: SearchViewModel = viewModel(factory = factory)
    val migrationViewModel: MigrationViewModel = viewModel(factory = factory)

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            if (currentRoute in tabs.map { it.route }) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = { navController.navigateToTab(tab.route) },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.DAILY,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            composable(Routes.DAILY) {
                DailyScreen(
                    viewModel = dailyViewModel,
                    onOpenMigration = { navController.navigate(Routes.MIGRATION) },
                    onOpenSearch = { navController.navigate(Routes.SEARCH) }
                )
            }

            composable(Routes.MONTHLY) {
                MonthlyScreen(
                    viewModel = monthlyViewModel,
                    onOpenDay = { date ->
                        dailyViewModel.setDate(date)
                        navController.navigateToTab(Routes.DAILY)
                    }
                )
            }

            composable(Routes.FUTURE) {
                FutureLogScreen(viewModel = futureViewModel)
            }

            composable(Routes.COLLECTIONS) {
                CollectionsScreen(
                    viewModel = collectionsViewModel,
                    onOpenCollection = { id -> navController.navigate(Routes.collectionDetail(id)) }
                )
            }

            composable(Routes.INDEX) {
                IndexScreen(
                    viewModel = indexViewModel,
                    onOpenMonth = { month ->
                        monthlyViewModel.setMonth(month)
                        navController.navigateToTab(Routes.MONTHLY)
                    },
                    onOpenCollection = { id -> navController.navigate(Routes.collectionDetail(id)) },
                    onOpenSearch = { navController.navigate(Routes.SEARCH) },
                    onOpenMigration = { navController.navigate(Routes.MIGRATION) }
                )
            }

            composable(Routes.SEARCH) {
                SearchScreen(viewModel = searchViewModel, onBack = { navController.popBackStack() })
            }

            composable(Routes.MIGRATION) {
                MigrationScreen(
                    viewModel = migrationViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Routes.COLLECTION_DETAIL,
                arguments = listOf(navArgument("collectionId") { type = NavType.LongType })
            ) { entry ->
                val id = entry.arguments?.getLong("collectionId") ?: 0L
                val detailViewModel: CollectionDetailViewModel = viewModel(
                    key = "collection-$id",
                    factory = collectionDetailFactory(repository, id)
                )
                CollectionDetailScreen(
                    viewModel = detailViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}

private fun androidx.navigation.NavHostController.navigateToTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
