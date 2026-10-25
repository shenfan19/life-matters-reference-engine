"""What the page needs to know about the catalog, before any life is run."""

from typing import Any, Dict


def catalog_view(catalog: Dict[str, Any]) -> Dict[str, Any]:
    cards, levers, packs = catalog['cards']['cards'], catalog['levers'], catalog['packs']['packs']
    return {
        'limitations': catalog['config']['limitations'],
        'packs': {pid: {'title': p['title'], 'text': p['text'], 'birth': p['birth'], 'years': p['years'],
                        'card': p.get('card'), 'start_age': p.get('start_age', catalog['config']['adult_start_age'])}
                  for pid, p in packs.items()},
        'cards': {cid: {'world': c['world'], 'title': c['title'], 'story': c['story'], 'tags': c['tags'],
                        'pack_only': c['pack_only'], 'survive_to_adult': c['survive_to_adult'],
                        'income': c['income'], 'work_profile': c['work_profile']}
                  for cid, c in cards.items()},
        'levers': {
            'spend': {name: {'title': lever['title'], 'text': lever['text'], 'variables': list(lever['effects'])}
                      for name, lever in levers['spend'].items()},
            'work': {'title': levers['work']['title'], 'text': levers['work']['text'], 'levels': levers['work']['levels']},
            'default_posture': levers['default_posture'],
        },
        'labels': catalog['labels'],
        'risk_titles': _risk_titles(catalog),
    }


def _risk_titles(catalog: Dict[str, Any]) -> Dict[str, Any]:
    groups = catalog['risk_groups']
    titles = {'age': groups['age']['title'], 'constant': groups['constant']['title']}
    for table in (groups['lifestyle'], groups['disease']):
        for entry in table.values():
            titles[entry['group']] = entry['title']
    return titles
