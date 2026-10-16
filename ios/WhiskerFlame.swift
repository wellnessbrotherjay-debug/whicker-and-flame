import SwiftUI
import AVKit

// The live website, which serves the Agency OS recipe library.
let apiBase = "https://whiskerflame.safetykat.com"
let paper = Color(red: 0.969, green: 0.945, blue: 0.902)
let surface = Color(red: 1.0, green: 0.988, blue: 0.965)
let ink = Color(red: 0.161, green: 0.153, blue: 0.133)
let muted = Color(red: 0.373, green: 0.345, blue: 0.31)
let copper = Color(red: 0.675, green: 0.243, blue: 0.106)
let olive = Color(red: 0.4, green: 0.408, blue: 0.263)
let line = Color(red: 0.871, green: 0.831, blue: 0.776)

// MARK: - Data (mirrors /api/catalog)

struct Recipe: Codable, Identifiable, Hashable {
 let id: String; let title: String; let description: String; let servings: Int; let image: String
 let ingredients: [String]; let steps: [String]; let allergens: String; let categories: [String]
 let difficulty: String; let totalMinutes: Int; let meatFree: Bool?; let editorialStatus: String?
}
struct Brand: Codable { let name: String; let tagline: String; let eyebrow: String; let promise: String; let footer: String }
struct Film: Codable { let eyebrow: String; let title: String; let text: String; let src: String; let poster: String }
struct Cast: Codable { let eyebrow: String; let title: String; let text: String; let image: String }
struct Character: Codable, Identifiable { let id: String; let name: String; let role: String; let bio: String; let quote: String; let relationship: String; let traits: [String]; let flaw: String; let comedy: String }
struct Collection: Codable, Identifiable { let id: String; let name: String; let text: String; let recipes: [String] }
struct Season: Codable { let eyebrow: String; let title: String; let teaser: String; let text: String; let status: String }
struct StoryEpisode: Codable, Identifiable { let n: Int; let title: String; let text: String; let recipe: String; let status: String; var id: Int { n } }
struct Notes: Codable { let sample: String; let allergy: String; let cats: String }
struct Site: Codable { let brand: Brand; let film: Film; let cast: Cast; let characters: [Character]; let collections: [Collection]; let season: Season; let episodes: [StoryEpisode]; let notes: Notes }
struct Catalog: Codable { let recipes: [Recipe]; let site: Site }

@MainActor final class Kitchen: ObservableObject {
 @Published var catalog: Catalog?
 @Published var saved: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "savedRecipes") ?? [])
 @Published var online = false
 var recipes: [Recipe] { catalog?.recipes ?? [] }
 init() {
  if let url = Bundle.main.url(forResource: "catalog", withExtension: "json"), let data = try? Data(contentsOf: url) {
   catalog = try? JSONDecoder().decode(Catalog.self, from: data)
  }
 }
 func refresh() async {
  do {
   var request = URLRequest(url: URL(string: apiBase + "/api/catalog")!); request.timeoutInterval = 5
   let (data, response) = try await URLSession.shared.data(for: request)
   guard (response as? HTTPURLResponse)?.statusCode == 200 else { online = false; return }
   catalog = try JSONDecoder().decode(Catalog.self, from: data); online = true
  } catch { online = false }
 }
 func recipe(_ id: String) -> Recipe? { recipes.first { $0.id == id } }
 func toggle(_ id: String) { if saved.contains(id) { saved.remove(id) } else { saved.insert(id) }; UserDefaults.standard.set(Array(saved), forKey: "savedRecipes") }
}

@main struct WhiskerHeatApp: App {
 @StateObject private var kitchen = Kitchen()
 @Environment(\.scenePhase) private var scenePhase
 var body: some Scene {
  WindowGroup {
   RootView().environmentObject(kitchen).tint(copper)
    .task { await kitchen.refresh() }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await kitchen.refresh() } } }
  }
 }
}

// MARK: - Shared pieces

struct Wordmark: View {
 var size: CGFloat = 22
 var body: some View { (Text("Whisker ") + Text("&").foregroundColor(copper).italic() + Text(" Heat").foregroundColor(copper)).font(.system(size: size, weight: .medium, design: .serif)) }
}
struct Eyebrow: View { let text: String; var body: some View { Text(text.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(1.6).foregroundStyle(copper) } }
struct Heading: View { let text: String; var size: CGFloat = 30; var body: some View { Text(text).font(.system(size: size, weight: .medium, design: .serif)).foregroundStyle(ink) } }

/// Bundled image first (works offline), then the server copy.
struct MediaImage: View {
 let path: String; var height: CGFloat = 200
 var body: some View {
  let name = (path as NSString).lastPathComponent
  Color.clear.frame(height: height).frame(maxWidth: .infinity)
   .overlay {
    if let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "Media"), let img = UIImage(contentsOfFile: url.path) {
     Image(uiImage: img).resizable().scaledToFill()
    } else {
     AsyncImage(url: URL(string: apiBase + path)) { $0.resizable().scaledToFill() } placeholder: { surface }
    }
   }
   .clipped().contentShape(Rectangle())
 }
}

struct PrimaryButton: ButtonStyle {
 func makeBody(configuration: Configuration) -> some View {
  configuration.label.font(.system(size: 15, weight: .semibold)).padding(.horizontal, 22).frame(minHeight: 48)
   .background(copper.opacity(configuration.isPressed ? 0.8 : 1)).foregroundStyle(.white).clipShape(Capsule())
 }
}

struct Page<Content: View>: View {
 @ViewBuilder let content: Content
 var body: some View {
  ScrollView { VStack(alignment: .leading, spacing: 22) { content }.padding(20).frame(maxWidth: 700, alignment: .leading).frame(maxWidth: .infinity) }
   .scrollDismissesKeyboard(.interactively).background(paper.ignoresSafeArea())
 }
}

struct RootView: View {
 var body: some View {
  TabView {
   NavigationStack { HomeView() }.tabItem { Label("Home", systemImage: "house") }
   NavigationStack { RecipesView() }.tabItem { Label("Recipes", systemImage: "fork.knife") }
   NavigationStack { CharactersView() }.tabItem { Label("Characters", systemImage: "pawprint") }
   NavigationStack { StoryView() }.tabItem { Label("Story", systemImage: "book") }
   NavigationStack { KitchenView() }.tabItem { Label("My kitchen", systemImage: "heart") }
  }
 }
}

struct RecipeCard: View {
 @EnvironmentObject var kitchen: Kitchen
 let recipe: Recipe
 var body: some View {
  VStack(alignment: .leading, spacing: 0) {
   NavigationLink(value: recipe) { MediaImage(path: recipe.image, height: 190) }.buttonStyle(.plain)
   VStack(alignment: .leading, spacing: 8) {
    Text("\(recipe.totalMinutes) min · \(recipe.difficulty) · Serves \(recipe.servings)").font(.system(size: 12)).foregroundStyle(muted)
    HStack(alignment: .top) {
     NavigationLink(value: recipe) { Text(recipe.title).font(.system(size: 22, design: .serif)).foregroundStyle(ink).multilineTextAlignment(.leading) }.buttonStyle(.plain)
     Spacer(minLength: 4)
     Button { kitchen.toggle(recipe.id) } label: { Image(systemName: kitchen.saved.contains(recipe.id) ? "heart.fill" : "heart").frame(width: 44, height: 44) }
      .accessibilityLabel(kitchen.saved.contains(recipe.id) ? "Unsave recipe" : "Save recipe")
    }
    Text(recipe.categories.joined(separator: " · ")).font(.system(size: 11, weight: .semibold)).foregroundStyle(olive)
   }.padding(16)
  }
  .background(surface).clipShape(RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(line))
 }
}

extension View {
 func recipeDestination() -> some View { navigationDestination(for: Recipe.self) { RecipeDetail(recipe: $0) } }
}

// MARK: - Screens

struct HomeView: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View {
  Page {
   if let site = kitchen.catalog?.site {
    Eyebrow(text: site.brand.eyebrow)
    Wordmark(size: 44)
    Text(site.brand.promise).font(.system(size: 17)).foregroundStyle(muted)
    MediaImage(path: site.cast.image, height: 260).clipShape(RoundedRectangle(cornerRadius: 20))
    NavigationLink { RecipesView() } label: { Label("Find your next recipe", systemImage: "arrow.right") }.buttonStyle(PrimaryButton())

    Eyebrow(text: site.film.eyebrow); Heading(text: site.film.title)
    Text(site.film.text).foregroundStyle(muted)
    FilmPlayer(src: site.film.src)

    Eyebrow(text: site.cast.eyebrow); Heading(text: "Four cats. Endless kitchen trouble.")
    ForEach(site.characters) { c in
     HStack(alignment: .top, spacing: 12) { Image(systemName: "pawprint.fill").foregroundStyle(copper); VStack(alignment: .leading, spacing: 2) { Text(c.name).font(.headline); Text(c.role).font(.subheadline).foregroundStyle(muted) } }
    }

    Eyebrow(text: "A new story is simmering"); Heading(text: site.season.title)
    Text(site.season.teaser).foregroundStyle(muted)

    Heading(text: "Something delicious.")
    ForEach(kitchen.recipes.prefix(3)) { RecipeCard(recipe: $0) }
    StatusLine()
   } else { ProgressView().frame(maxWidth: .infinity) }
  }
  .refreshable { await kitchen.refresh() }
  .toolbar { ToolbarItem(placement: .principal) { Wordmark() } }
  .navigationBarTitleDisplayMode(.inline).recipeDestination()
 }
}

struct FilmPlayer: View {
 let src: String
 @State private var player: AVPlayer?
 var body: some View {
  VideoPlayer(player: player).frame(height: 210).clipShape(RoundedRectangle(cornerRadius: 16))
   .onAppear { if player == nil, let url = URL(string: apiBase + src) { player = AVPlayer(url: url) } }
   .onDisappear { player?.pause() }
 }
}

struct StatusLine: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View { Text(kitchen.online ? "Synced with the kitchen" : "Offline · showing saved recipes").font(.system(size: 11)).foregroundStyle(muted) }
}

struct RecipesView: View {
 @EnvironmentObject var kitchen: Kitchen
 @State private var query = ""
 @State private var category = "All"
 var categories: [String] { ["All"] + Array(Set(kitchen.recipes.flatMap(\.categories))).sorted() }
 var filtered: [Recipe] {
  kitchen.recipes.filter { r in
   (category == "All" || r.categories.contains(category)) &&
   (query.isEmpty || ([r.title, r.description] + r.ingredients).joined(separator: " ").localizedCaseInsensitiveContains(query))
  }
 }
 var body: some View {
  Page {
   Eyebrow(text: "Recipes"); Heading(text: "Find your next recipe.", size: 36)
   ScrollView(.horizontal, showsIndicators: false) {
    HStack { ForEach(categories, id: \.self) { c in
     Button(c) { category = c }.font(.system(size: 13, weight: .medium)).padding(.horizontal, 16).frame(minHeight: 40)
      .background(category == c ? copper : surface).foregroundStyle(category == c ? .white : ink).clipShape(Capsule()).overlay(Capsule().stroke(line))
    } }
   }
   if filtered.isEmpty { Text("No recipes match that yet.").foregroundStyle(muted) }
   ForEach(filtered) { RecipeCard(recipe: $0) }
  }
  .searchable(text: $query, prompt: "Search recipes or ingredients")
  .navigationTitle("Recipes").navigationBarTitleDisplayMode(.inline).recipeDestination()
 }
}

struct RecipeDetail: View {
 @EnvironmentObject var kitchen: Kitchen
 let recipe: Recipe
 @State private var done: Set<Int> = []
 var body: some View {
  Page {
   MediaImage(path: recipe.image, height: 260).clipShape(RoundedRectangle(cornerRadius: 20))
   Text(recipe.categories.joined(separator: " · ").uppercased()).font(.system(size: 10, weight: .semibold)).tracking(1.4).foregroundStyle(copper)
   Heading(text: recipe.title, size: 34)
   Text(recipe.description).foregroundStyle(muted)
   HStack(spacing: 18) { Label("\(recipe.totalMinutes) min", systemImage: "clock"); Label(recipe.difficulty, systemImage: "chart.bar"); Label("Serves \(recipe.servings)", systemImage: "person.2") }.font(.system(size: 13)).foregroundStyle(muted)
   Button { kitchen.toggle(recipe.id) } label: { Label(kitchen.saved.contains(recipe.id) ? "Saved to my kitchen" : "Save to my kitchen", systemImage: kitchen.saved.contains(recipe.id) ? "heart.fill" : "heart") }.buttonStyle(PrimaryButton())
   Heading(text: "Ingredients", size: 24)
   VStack(alignment: .leading, spacing: 8) { ForEach(recipe.ingredients, id: \.self) { i in HStack(alignment: .top) { Text("•").foregroundStyle(copper); Text(i) } } }
   Text("Allergens: " + recipe.allergens).font(.system(size: 13)).foregroundStyle(muted)
   Heading(text: "Shopping list", size: 24)
   ShoppingList(recipe: recipe)
   Heading(text: "Method", size: 24)
   ForEach(Array(recipe.steps.enumerated()), id: \.offset) { n, step in
    Button { if done.contains(n) { done.remove(n) } else { done.insert(n) } } label: {
     HStack(alignment: .top, spacing: 12) {
      Image(systemName: done.contains(n) ? "checkmark.circle.fill" : "\(n + 1).circle").font(.title3).foregroundStyle(copper)
      Text(step).foregroundStyle(done.contains(n) ? muted : ink).strikethrough(done.contains(n)).multilineTextAlignment(.leading)
     }
    }.buttonStyle(.plain)
   }
   if let notes = kitchen.catalog?.site.notes {
    Text(notes.allergy).font(.system(size: 12)).foregroundStyle(muted)
    Text(notes.cats).font(.system(size: 12)).foregroundStyle(muted)
   }
  }
  .navigationBarTitleDisplayMode(.inline)
 }
}

struct CharactersView: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View {
  Page {
   if let site = kitchen.catalog?.site {
    Eyebrow(text: site.cast.eyebrow); Heading(text: site.cast.title, size: 36)
    Text(site.cast.text).foregroundStyle(muted)
    MediaImage(path: site.cast.image, height: 240).clipShape(RoundedRectangle(cornerRadius: 20))
    ForEach(site.characters) { c in
     VStack(alignment: .leading, spacing: 8) {
      Heading(text: c.name, size: 26); Eyebrow(text: c.role)
      Text(c.bio)
      Text("“\(c.quote)”").font(.system(size: 17, design: .serif)).italic().foregroundStyle(copper)
      Text(c.traits.joined(separator: " · ")).font(.system(size: 12, weight: .semibold)).foregroundStyle(olive)
      Text(c.relationship).font(.system(size: 14)).foregroundStyle(muted)
     }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(surface).clipShape(RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(line))
    }
    Heading(text: "Collections", size: 26)
    ForEach(site.collections) { col in
     VStack(alignment: .leading, spacing: 6) {
      Text(col.name).font(.headline); Text(col.text).font(.subheadline).foregroundStyle(muted)
      ForEach(col.recipes.compactMap { kitchen.recipe($0) }) { r in NavigationLink(value: r) { Label(r.title, systemImage: "arrow.right").font(.subheadline) } }
     }.padding(.vertical, 6)
    }
   }
  }
  .navigationTitle("Characters").navigationBarTitleDisplayMode(.inline).recipeDestination()
 }
}

struct StoryView: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View {
  Page {
   if let site = kitchen.catalog?.site {
    Eyebrow(text: site.season.eyebrow); Heading(text: site.season.title, size: 36)
    Text(site.season.text).foregroundStyle(muted)
    ForEach(site.episodes) { ep in
     VStack(alignment: .leading, spacing: 8) {
      Eyebrow(text: "Episode \(ep.n) · \(ep.status)")
      Heading(text: ep.title, size: 22)
      Text(ep.text).font(.system(size: 15))
      if let r = kitchen.recipe(ep.recipe) { NavigationLink(value: r) { Label("Cook \(r.title)", systemImage: "fork.knife") } }
     }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(surface).clipShape(RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(line))
    }
   }
  }
  .navigationTitle("The story").navigationBarTitleDisplayMode(.inline).recipeDestination()
 }
}

struct KitchenView: View {
 @EnvironmentObject var kitchen: Kitchen
 var saved: [Recipe] { kitchen.recipes.filter { kitchen.saved.contains($0.id) } }
 var body: some View {
  Page {
   Eyebrow(text: "My kitchen"); Heading(text: "Your saved recipes.", size: 36)
   if saved.isEmpty {
    Text("Tap the heart on any recipe to keep it here.").foregroundStyle(muted)
    NavigationLink { RecipesView() } label: { Label("Browse recipes", systemImage: "arrow.right") }.buttonStyle(PrimaryButton())
   }
   ForEach(saved) { RecipeCard(recipe: $0) }
   StatusLine()
  }
  .navigationTitle("My kitchen").navigationBarTitleDisplayMode(.inline).recipeDestination()
 }
}

// MARK: - Shopping list

// One recipe's shopping list: scale it to how many you're feeding, tick off what's in the basket, share what's left.
struct ShoppingList: View {
 let recipe: Recipe
 @State private var people = 0
 @State private var bought: Set<Int> = []
 private var serves: Int { people == 0 ? recipe.servings : people }
 private var items: [String] { recipe.ingredients.map { scaled($0, by: Double(serves) / Double(max(recipe.servings, 1))) } }
 var body: some View {
  VStack(alignment: .leading, spacing: 12) {
   Stepper("Shopping for \(serves) \(serves == 1 ? "person" : "people")", value: Binding(get: { serves }, set: { people = $0 }), in: 1...20).font(.system(size: 15, weight: .semibold))
   HStack { Text("\(bought.count) of \(items.count) in the basket"); Spacer(); if !bought.isEmpty { Button("Clear") { bought = []; save() } } }.font(.system(size: 12)).foregroundStyle(muted)
   ForEach(Array(items.enumerated()), id: \.offset) { i, text in
    Button { if bought.contains(i) { bought.remove(i) } else { bought.insert(i) }; save() } label: {
     HStack(spacing: 12) { Image(systemName: bought.contains(i) ? "cart.fill" : "cart").foregroundStyle(copper); Text(text).foregroundStyle(bought.contains(i) ? muted : ink).strikethrough(bought.contains(i)).multilineTextAlignment(.leading); Spacer() }.padding(.vertical, 4)
    }.buttonStyle(.plain)
   }
   ShareLink(item: "\(recipe.title) · shopping for \(serves)\n" + items.enumerated().filter { !bought.contains($0.offset) }.map { "• " + $0.element }.joined(separator: "\n")) {
    Label("Share shopping list", systemImage: "square.and.arrow.up")
   }.buttonStyle(PrimaryButton())
  }
  .onAppear { bought = Set(UserDefaults.standard.array(forKey: "bought-" + recipe.id) as? [Int] ?? []) }
 }
 private func save() { UserDefaults.standard.set(Array(bought), forKey: "bought-" + recipe.id) }
 // Scales a leading amount ("180 g pasta", "1/4 tsp salt", "2 garlic cloves"); lines without one ("Black pepper to taste") stay as written.
 private func scaled(_ line: String, by factor: Double) -> String {
  guard factor != 1, let m = line.firstMatch(of: /^(\d+(?:\.\d+)?)(?:\/(\d+))?(?=\s|$)/) else { return line }
  var amount = Double(String(m.1))!
  if let d = m.2 { amount /= Double(String(d))! }
  let v = amount * factor
  // Under 10, round to the nearest quarter and write it the way a recipe would: 1/4, 1/2, 1 1/2.
  let quarters = Int((v * 4).rounded()), whole = quarters / 4, part = ["", "1/4", "1/2", "3/4"][quarters % 4]
  let shown = v >= 10 ? String(Int(v.rounded())) : quarters == 0 ? "a pinch of" : whole == 0 ? part : part.isEmpty ? String(whole) : "\(whole) \(part)"
  return shown + line[m.range.upperBound...]
 }
}
