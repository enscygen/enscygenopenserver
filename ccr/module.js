export async function searchRegistry(query) {
  const url = "https://enscygen.github.io/enscygenopenserver/ccr/culture.json";

  try {
    // Fetch the JSON data
    const response = await fetch(url);
    const cultures = await response.json();

    // Filter data based on the query
    const filteredCultures = cultures.filter((culture) =>
      culture.name.toLowerCase().includes(query.toLowerCase()) ||
      culture.id.toLowerCase().includes(query.toLowerCase())
    );

    return filteredCultures;
  } catch (error) {
    console.error("Error fetching or filtering cultures:", error);
    return [];
  }
}


