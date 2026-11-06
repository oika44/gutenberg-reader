/** 目録 CSV の見本（CRLF 区切り）。英語の Text は 1342・2・100 の 3 件 */
export const CATALOG_CSV = [
  'Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves',
  '1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane, 1775-1817",Love stories,PR,"Best Books Ever Listings; Category: Novels; Category: British Literature; Category: Novels"',
  '2,Text,1971-12-01,"The United States Bill of Rights\nThe Ten Original Amendments",en,,Civil rights,JK,US Civil War',
  '100,Text,1994-01-01,"The ""Complete"" Works",en; fr,"Shakespeare, William, 1564-1616",Drama,PR,Category: Plays/Films/Dramas',
  '200,Sound,2005-01-01,Audio Book,en,"Reader, Some",Audio,,',
  '300,Text,1994-05-01,Les Misérables,fr,"Hugo, Victor",Fiction,PQ,',
].join('\r\n');
